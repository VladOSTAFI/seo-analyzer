import "server-only";

import { cookies } from "next/headers";

import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
} from "@/lib/constants";
import type { IssuedTokens } from "@/lib/api/types";

/**
 * Server-only read/write/clear of the auth token cookies (`sd_at` / `sd_rt`).
 *
 * Security model:
 *   - Tokens live EXCLUSIVELY in httpOnly cookies — never localStorage, never a
 *     client component, never readable from `document.cookie`. This is the main
 *     defence against token theft via XSS.
 *   - `httpOnly` keeps them off client JS; `secure` (prod only) keeps them off
 *     plaintext HTTP; `sameSite=lax` blocks cross-site CSRF on top-level GETs
 *     while still allowing the user to arrive from an external link.
 *   - `path: "/"` so both the proxy route handler and Server Actions can read
 *     and rotate them.
 *
 * `cookies()` is async in Next 16 and must be awaited. Cookie mutation
 * (`set`/`delete`) is only legal inside a Server Action or Route Handler — the
 * only places these writers are called from.
 */

/** `true` outside local dev — gates the `Secure` attribute. */
const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Cookie lifetimes. These cap how long a cookie survives in the browser; the
 * backend still enforces the real token TTLs (access ≈ 15m, refresh ≈ 30d) and
 * rotation. We give the access cookie a generous max-age (the proxy refreshes
 * it transparently long before then) and the refresh cookie 30 days so a
 * returning user stays signed in.
 */
const ACCESS_MAX_AGE = 60 * 60 * 24; // 1 day (proxy refreshes well before expiry)
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const BASE_COOKIE = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax",
  path: "/",
} as const;

/** Read the current access token (the Bearer for backend calls), if any. */
export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_ACCESS_TOKEN)?.value;
}

/** Read the current refresh token (used by the proxy's transparent refresh). */
export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_REFRESH_TOKEN)?.value;
}

/** True when a session cookie pair is present (cheap, unvalidated check). */
export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return store.has(COOKIE_ACCESS_TOKEN) || store.has(COOKIE_REFRESH_TOKEN);
}

/**
 * Persist the backend-issued token pair. Call ONLY from a Server Action or
 * Route Handler (cookie writes require an outgoing response).
 */
export async function setSession(tokens: IssuedTokens): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_ACCESS_TOKEN, tokens.accessToken, {
    ...BASE_COOKIE,
    maxAge: ACCESS_MAX_AGE,
  });
  store.set(COOKIE_REFRESH_TOKEN, tokens.refreshToken, {
    ...BASE_COOKIE,
    maxAge: REFRESH_MAX_AGE,
  });
}

/**
 * Drop both token cookies (logout, or when refresh fails). Same call-site
 * constraint as {@link setSession}.
 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_ACCESS_TOKEN);
  store.delete(COOKIE_REFRESH_TOKEN);
}
