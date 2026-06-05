import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeJwt } from "jose";

import { refreshTokensResult } from "@/lib/api/backend";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  LOGIN_HREF,
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE_MAX_AGE,
  BASE_TOKEN_COOKIE,
} from "@/lib/constants";

/**
 * Edge-of-app gate for the `(dashboard)` route group, and — critically — the
 * write-capable boundary where TRANSPARENT TOKEN REFRESH happens on navigation.
 *
 * Why refresh lives here (Next 16 constraint):
 *   `cookies().set()` is illegal during a Server Component render — the store is
 *   sealed read-only and throws. The dashboard/audits pages are Server
 *   Components that fetch via the Bearer API client, so they CANNOT rotate the
 *   cookie pair when the access token has expired: a rotation attempted there is
 *   dropped, and because the backend issues SINGLE-USE refresh tokens, the next
 *   navigation reuses an already-invalidated `sd_rt` and the session collapses
 *   to a forced logout. The middleware runs BEFORE render and owns the
 *   navigation response, so it can both (a) write the rotated pair as
 *   `Set-Cookie` for the browser and (b) rewrite the inbound request cookies so
 *   the render that follows reads the FRESH access token. That makes refresh
 *   actually stick.
 *
 * Flow per matched navigation:
 *   1. No session cookies at all → anonymous → redirect to `/login`.
 *   2. Access token present and NOT expired → pass straight through.
 *   3. Access token missing/expired but a refresh token is present → call
 *      `/auth/refresh` ONCE. On success: stamp the rotated pair onto the request
 *      (for this render) and the response (for the browser), then continue. On
 *      failure: clear both cookies and redirect to `/login`.
 *
 * The cookies are httpOnly, so nothing here exposes a token to client JS, and
 * token values are never logged.
 *
 * Coverage: the matcher spans the whole `(dashboard)` route group (`/dashboard`
 * AND `/audits`), so EVERY authenticated navigation gets the refresh boundary —
 * not just `/dashboard`. The `/api/proxy/*` route keeps its own in-handler
 * refresh for browser-initiated XHR (polling, report download) and is excluded
 * here.
 *
 * Next 16 renamed `middleware` → `proxy`; the `middleware` filename is still
 * supported and the implementation plan keeps it. Middleware defaults to the
 * Node.js runtime in Next 16, so `fetch` to the backend and `jose` decoding work
 * here.
 */

/** Decode the access JWT and report whether it is still valid (exp in future). */
function accessTokenIsLive(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const claims = decodeJwt<{ exp?: number }>(token);
    // No `exp` → treat as live and let the backend be the authority on a 401.
    if (typeof claims.exp !== "number") return true;
    // Small skew so we refresh just-before, not just-after, expiry.
    return claims.exp * 1000 > Date.now() + 5_000;
  } catch {
    // Malformed token → not usable.
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

  // (1) No session at all → anonymous.
  if (!accessToken && !refreshToken) {
    return redirectToLogin(request);
  }

  // (2) Access token still valid → nothing to do.
  if (accessTokenIsLive(accessToken)) {
    return NextResponse.next();
  }

  // (3) Access token missing/expired. If we have no refresh token there is
  // nothing to rotate with → end the session.
  if (!refreshToken) {
    return endSession(request);
  }

  const result = await refreshTokensResult(refreshToken);

  if (!result.ok) {
    // Backend unreachable → transient outage, NOT an auth failure. Preserve the
    // session (don't burn the user out over a blip) and let the request through;
    // the page degrades to its backend-down state, and the next navigation
    // retries the refresh once the backend is back.
    if (result.reason === "unreachable") {
      return NextResponse.next();
    }
    // Genuinely rejected (invalid / expired / revoked) → end the session.
    return endSession(request);
  }

  // Success: make the FRESH access token visible to the render that follows by
  // rewriting the inbound request cookies, and persist the rotated pair to the
  // browser via `Set-Cookie` on the response.
  const { tokens } = result;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "cookie",
    rewriteCookieHeader(request.headers.get("cookie"), {
      [COOKIE_ACCESS_TOKEN]: tokens.accessToken,
      [COOKIE_REFRESH_TOKEN]: tokens.refreshToken,
    }),
  );

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.cookies.set(COOKIE_ACCESS_TOKEN, tokens.accessToken, {
    ...BASE_TOKEN_COOKIE,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  response.cookies.set(COOKIE_REFRESH_TOKEN, tokens.refreshToken, {
    ...BASE_TOKEN_COOKIE,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
  return response;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL(LOGIN_HREF, request.url);
  // Preserve where the user was headed so we could return them post-login.
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

/** Redirect to login AND clear both token cookies on the redirect response. */
function endSession(request: NextRequest): NextResponse {
  const response = redirectToLogin(request);
  response.cookies.delete(COOKIE_ACCESS_TOKEN);
  response.cookies.delete(COOKIE_REFRESH_TOKEN);
  return response;
}

/**
 * Return a `Cookie` request-header string with the given names overwritten to
 * the supplied values (others preserved, order otherwise unchanged), so the
 * downstream render reads the rotated tokens instead of the stale inbound ones.
 */
function rewriteCookieHeader(
  original: string | null,
  overrides: Record<string, string>,
): string {
  const pending = new Set(Object.keys(overrides));
  const parts: string[] = [];

  if (original) {
    for (const segment of original.split(";")) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      const name = eq === -1 ? trimmed : trimmed.slice(0, eq);
      if (name in overrides) {
        parts.push(`${name}=${overrides[name]}`);
        pending.delete(name);
      } else {
        parts.push(trimmed);
      }
    }
  }

  // Add any overrides that weren't already present in the inbound header.
  for (const name of pending) {
    parts.push(`${name}=${overrides[name]}`);
  }

  return parts.join("; ");
}

export const config = {
  // Cover the whole authenticated route group: `/dashboard` and `/audits`
  // (both the bare paths and their subtrees) so the refresh boundary runs on
  // every authenticated navigation, not just `/dashboard`.
  matcher: ["/dashboard/:path*", "/dashboard", "/audits/:path*", "/audits"],
};
