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
 * Exchange the opaque refresh token for a rotated `{ accessToken, refreshToken }`
 * pair via `POST /auth/refresh`. Returns `null` on any non-200 (invalid /
 * expired / revoked / network), signalling the caller to clear cookies and
 * force re-login. Never logs the tokens.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<IssuedTokens | null> {
  let res: Response;
  try {
    res = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  try {
    const body = (await res.json()) as Partial<IssuedTokens>;
    if (
      typeof body.accessToken === "string" &&
      typeof body.refreshToken === "string"
    ) {
      return { accessToken: body.accessToken, refreshToken: body.refreshToken };
    }
  } catch {
    /* fall through */
  }
  return null;
}
