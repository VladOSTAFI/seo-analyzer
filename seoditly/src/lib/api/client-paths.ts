/**
 * Browser-safe proxy path builders. Unlike `lib/api/client.ts` (which is
 * `server-only` because it reads the access-token cookie and calls the
 * backend), these are pure string builders for the `/api/proxy/*` boundary, so
 * they can be imported by client components (e.g. the report download button
 * and the polling wrapper).
 *
 * Every value returned here is a same-origin `/api/proxy/...` path — the
 * browser hits the Next.js server, which attaches the Bearer token and forwards
 * to the backend. The browser never sees the backend origin or the token.
 */

/**
 * Proxy path for the streamed `.xlsx` report. The backend returns `409` until
 * the report exists, so callers must gate this on `reportPath != null`.
 */
export function reportProxyPath(id: string): string {
  return `/api/proxy/audits/${encodeURIComponent(id)}/report`;
}

/** Proxy path for `GET /audits/:id` — used by the detail polling loop. */
export function auditProxyPath(id: string): string {
  return `/api/proxy/audits/${encodeURIComponent(id)}`;
}
