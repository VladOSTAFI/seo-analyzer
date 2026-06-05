import "server-only";

import { backendUrl, refreshTokens } from "@/lib/api/backend";
import {
  getAccessToken,
  setSession,
  clearSession,
  cookiesAreWritable,
} from "@/lib/auth/session";
import type {
  AuditDetailDto,
  AuditDto,
  AuditStatus,
  AuthUser,
  FindingDto,
  Paginated,
  Severity,
} from "@/lib/api/types";

/**
 * Typed, server-only API client for the SEO Audit backend.
 *
 * Consistency with the proxy model: this client runs ONLY in server code
 * (Server Components / Server Actions), reads the access token from the httpOnly
 * cookie, and attaches `Authorization: Bearer` itself — the same identity-
 * carrying boundary the `/api/proxy` route enforces for browser-initiated
 * traffic.
 *
 * Transparent refresh — and the Next 16 cookie-write constraint:
 *   `cookies().set()` is ONLY legal in a Server Action or Route Handler; during
 *   a Server Component render the store is read-only and throws. So this client
 *   can only safely rotate the cookie pair when invoked from a write-capable
 *   phase (e.g. the start-audit Server Action). When invoked during render
 *   (e.g. the dashboard fetching `listAudits`), the proactive refresh boundary
 *   in `src/middleware.ts` has already rotated an expired token BEFORE render,
 *   so a 401 here is unexpected; if it still happens we surface it WITHOUT
 *   consuming the single-use refresh token (which we couldn't persist anyway),
 *   leaving the middleware to recover on the next navigation. In a write-capable
 *   phase we keep the familiar refresh-once-rotate-retry behaviour, mirroring
 *   the proxy.
 *
 * The `request<T>` helper + `ApiError` shape are ported from
 * `frontend/src/api.ts` so the error contract is familiar.
 */

/** Thrown for any non-2xx response; carries the HTTP status + server message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Core request helper. Attaches the Bearer access token, retries once through a
 * token refresh on `401`, and decodes JSON. Throws {@link ApiError} on non-2xx.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();

  const send = (token: string | undefined): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(backendUrl(path), {
      ...init,
      headers,
      cache: "no-store",
    });
  };

  let res: Response;
  try {
    res = await send(accessToken);
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the API. Is the backend running?",
    );
  }

  // ── Transparent refresh on 401 ────────────────────────────────────────────
  if (res.status === 401) {
    // Cookie rotation requires a write-capable phase. During a Server Component
    // render the store is sealed: refreshing here would burn the single-use
    // refresh token without being able to persist the rotated pair, breaking
    // the chain. In that case surface the 401 WITHOUT clearing the session, so
    // the middleware refresh boundary can recover on the next navigation.
    if (!(await cookiesAreWritable())) {
      throw new ApiError(401, "Session expired.");
    }

    const { getRefreshToken } = await import("@/lib/auth/session");
    const refreshToken = await getRefreshToken();
    const rotated = refreshToken ? await refreshTokens(refreshToken) : null;

    if (!rotated) {
      await clearSession();
      throw new ApiError(401, "Session expired.");
    }

    await setSession(rotated);
    try {
      res = await send(rotated.accessToken);
    } catch {
      throw new ApiError(0, "Cannot reach the API. Is the backend running?");
    }

    if (res.status === 401) {
      await clearSession();
      throw new ApiError(401, "Session expired.");
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }

  // 204 No Content (e.g. logout) — nothing to decode.
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────

/** GET /auth/me — the authenticated principal. */
export function getMe(): Promise<AuthUser> {
  return request<AuthUser>("/auth/me");
}

// ── Audits (read foundation; Phase 5 extends with mutations + filters) ──────

/** GET /audits — the caller's own audits, newest-first, paginated. */
export function listAudits(
  limit = 20,
  offset = 0,
): Promise<Paginated<AuditDto>> {
  return request<Paginated<AuditDto>>(
    `/audits?limit=${limit}&offset=${offset}`,
  );
}

/** GET /audits/:id — detail + finding rollups (404 if missing or not owned). */
export function getAudit(id: string): Promise<AuditDetailDto> {
  return request<AuditDetailDto>(`/audits/${encodeURIComponent(id)}`);
}

/** GET /audits/:id/findings — optional severity + ruleId filter, paginated. */
export function listFindings(
  id: string,
  opts: {
    severity?: Severity;
    ruleId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Paginated<FindingDto>> {
  const q = new URLSearchParams();
  q.set("limit", String(opts.limit ?? 200));
  q.set("offset", String(opts.offset ?? 0));
  if (opts.severity) q.set("severity", opts.severity);
  if (opts.ruleId) q.set("ruleId", opts.ruleId);
  return request<Paginated<FindingDto>>(
    `/audits/${encodeURIComponent(id)}/findings?${q.toString()}`,
  );
}

/**
 * POST /audits — start a new audit for `url`. The backend stamps `ownerId` from
 * the Bearer token (so ownership is automatic) and runs the pipeline
 * fire-and-forget, returning `{ id, status: 'created' }`.
 *
 * SSRF NOTE: this method does NOT itself validate the target host — callers
 * MUST run `rejectUnsafeAuditUrl` / `startAuditSchema` (see
 * `lib/validation/audit-url.ts`) first, as the backend has no host validation.
 */
export function createAudit(
  url: string,
): Promise<{ id: string; status: AuditStatus }> {
  return request<{ id: string; status: AuditStatus }>("/audits", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// Re-export the browser-safe proxy path builders so server callers have one
// import surface. The implementations live in `client-paths.ts` (not
// `server-only`) so client components can import them too.
export { reportProxyPath, auditProxyPath } from "@/lib/api/client-paths";
