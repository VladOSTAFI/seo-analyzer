import "server-only";

import type { IssuedTokens } from "@/lib/api/types";

/**
 * Server-only helpers for talking to the NestJS SEO Audit backend.
 *
 * `BACKEND_URL` is read here so every caller (proxy handler + API client) shares
 * one source of truth and one trailing-slash normalisation. It is NEVER exposed
 * to the browser (no `NEXT_PUBLIC_`); the browser only ever sees `/api/proxy/*`.
 */

/** Base URL of the backend, e.g. `http://localhost:3000`. Server-only. */
export function backendBaseUrl(): string {
  const raw = process.env.BACKEND_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Build an absolute backend URL from a leading-slash path (`/audits`, …). */
export function backendUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${backendBaseUrl()}${p}`;
}

/**
 * Backend path prefixes the proxy is allowed to forward to. This is the
 * open-proxy guard: the catch-all handler only relays paths under one of these
 * prefixes, so an attacker can't coerce the proxy into hitting an arbitrary
 * internal URL (SSRF) or an unrelated backend route.
 */
export const ALLOWED_PROXY_PREFIXES = ["/audits", "/auth/me"] as const;

/** True when `path` (leading slash, no query) is within an allowed prefix. */
export function isAllowedProxyPath(path: string): boolean {
  return ALLOWED_PROXY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Outcome of a refresh attempt, distinguishing the two failure modes so callers
 * can react correctly:
 *   - `{ ok: true, tokens }`  — rotated pair issued.
 *   - `{ ok: false, reason: "rejected" }`   — backend answered non-200 (invalid /
 *      expired / revoked refresh token) → the session is genuinely over.
 *   - `{ ok: false, reason: "unreachable" }` — network/transport failure → the
 *      session may still be valid; callers should NOT log the user out over a
 *      transient outage.
 */
export type RefreshResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; reason: "rejected" | "unreachable" };

/**
 * Exchange the opaque refresh token for a rotated `{ accessToken, refreshToken }`
 * pair via `POST /auth/refresh`, distinguishing "rejected" from "unreachable".
 * Never logs the tokens.
 */
export async function refreshTokensResult(
  refreshToken: string,
): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    // Transport failure — backend down/unreachable. Not an auth rejection.
    return { ok: false, reason: "unreachable" };
  }

  if (!res.ok) return { ok: false, reason: "rejected" };

  try {
    const body = (await res.json()) as Partial<IssuedTokens>;
    if (
      typeof body.accessToken === "string" &&
      typeof body.refreshToken === "string"
    ) {
      return {
        ok: true,
        tokens: { accessToken: body.accessToken, refreshToken: body.refreshToken },
      };
    }
  } catch {
    /* fall through — malformed body is treated as a rejection */
  }
  return { ok: false, reason: "rejected" };
}

/**
 * Convenience wrapper preserving the original contract: returns the rotated pair
 * on success or `null` on any failure (rejected OR unreachable), signalling the
 * caller to clear cookies and force re-login. Used by the proxy handler and the
 * server API client, where a failed refresh during a live authenticated request
 * already means the session can't continue.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<IssuedTokens | null> {
  const result = await refreshTokensResult(refreshToken);
  return result.ok ? result.tokens : null;
}
