import { cookies } from "next/headers";

import {
  backendUrl,
  isAllowedProxyPath,
  refreshTokens,
} from "@/lib/api/backend";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
} from "@/lib/constants";

/**
 * Server-only forwarder: browser → Next.js server → backend, NEVER
 * browser → backend. The handler reads the access token from the `sd_at`
 * httpOnly cookie, attaches `Authorization: Bearer`, and relays the request to
 * `BACKEND_URL`. The browser never sees the backend origin or the tokens.
 *
 * Transparent refresh (the critical flow):
 *   1. Forward the original request with the current access token.
 *   2. If the backend answers `401` (access token expired), call
 *      `/auth/refresh` with `sd_rt` EXACTLY ONCE.
 *   3. On success: write the rotated pair back into the cookies and retry the
 *      original request once with the fresh access token.
 *   4. If refresh fails (or there was no refresh token): clear both cookies and
 *      return `401` so the UI redirects to `/login`.
 *
 * Open-proxy guard: only paths under an allowed prefix (`/audits`, `/auth/me`)
 * are relayed — see `isAllowedProxyPath`. Arbitrary absolute URLs are rejected.
 *
 * Node runtime is required: we mutate httpOnly cookies and read request bodies.
 */
export const runtime = "nodejs";
// This route is inherently per-request (auth cookies); never statically cache.
export const dynamic = "force-dynamic";

/** Request headers we forward to the backend (everything else is dropped). */
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept"];

interface ProxyContext {
  params: Promise<{ path: string[] }>;
}

async function handle(
  req: Request,
  ctx: ProxyContext,
): Promise<Response> {
  const { path } = await ctx.params;
  const backendPath = `/${(path ?? []).join("/")}`;

  if (!isAllowedProxyPath(backendPath)) {
    return Response.json(
      { message: "Not found." },
      { status: 404 },
    );
  }

  // Preserve the incoming query string.
  const search = new URL(req.url).search;
  const target = `${backendUrl(backendPath)}${search}`;

  // Buffer the body once so the retry can reuse it (a Request body is a
  // one-shot stream). GET/HEAD have no body.
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;

  const baseHeaders = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) baseHeaders.set(name, value);
  }

  const store = await cookies();
  const accessToken = store.get(COOKIE_ACCESS_TOKEN)?.value;

  const send = (token: string | undefined): Promise<Response> => {
    const headers = new Headers(baseHeaders);
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(target, {
      method: req.method,
      headers,
      body: bodyBuffer ? Buffer.from(bodyBuffer) : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  };

  let upstream: Response;
  try {
    upstream = await send(accessToken);
  } catch {
    return Response.json(
      { message: "Cannot reach the backend." },
      { status: 502 },
    );
  }

  // ── Transparent refresh on 401 (exactly once) ────────────────────────────
  if (upstream.status === 401) {
    const refreshToken = store.get(COOKIE_REFRESH_TOKEN)?.value;
    const rotated = refreshToken ? await refreshTokens(refreshToken) : null;

    if (!rotated) {
      // Refresh impossible/failed → end the session.
      store.delete(COOKIE_ACCESS_TOKEN);
      store.delete(COOKIE_REFRESH_TOKEN);
      return Response.json({ message: "Session expired." }, { status: 401 });
    }

    // Rotate cookies (httpOnly, secure in prod, sameSite lax).
    const isProd = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
    };
    store.set(COOKIE_ACCESS_TOKEN, rotated.accessToken, {
      ...cookieOpts,
      maxAge: 60 * 60 * 24,
    });
    store.set(COOKIE_REFRESH_TOKEN, rotated.refreshToken, {
      ...cookieOpts,
      maxAge: 60 * 60 * 24 * 30,
    });

    try {
      upstream = await send(rotated.accessToken);
    } catch {
      return Response.json(
        { message: "Cannot reach the backend." },
        { status: 502 },
      );
    }

    // Still 401 after a fresh token → revoked/version-bumped → end session.
    if (upstream.status === 401) {
      store.delete(COOKIE_ACCESS_TOKEN);
      store.delete(COOKIE_REFRESH_TOKEN);
      return Response.json({ message: "Session expired." }, { status: 401 });
    }
  }

  // ── Relay the upstream response back to the browser ───────────────────────
  // Stream the body through unchanged (handles JSON and the .xlsx report
  // passthrough for Phase 5). Strip hop-by-hop / encoding headers that don't
  // survive a re-proxy.
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "content-encoding" ||
      lower === "content-length" ||
      lower === "transfer-encoding" ||
      lower === "connection"
    ) {
      return;
    }
    responseHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function GET(req: Request, ctx: ProxyContext): Promise<Response> {
  return handle(req, ctx);
}

export function POST(req: Request, ctx: ProxyContext): Promise<Response> {
  return handle(req, ctx);
}

export function PUT(req: Request, ctx: ProxyContext): Promise<Response> {
  return handle(req, ctx);
}

export function PATCH(req: Request, ctx: ProxyContext): Promise<Response> {
  return handle(req, ctx);
}

export function DELETE(req: Request, ctx: ProxyContext): Promise<Response> {
  return handle(req, ctx);
}
