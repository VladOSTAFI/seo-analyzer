import "server-only";

import { cookies } from "next/headers";

import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE_MAX_AGE,
  BASE_TOKEN_COOKIE,
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
 *   - `path: "/"` so the proxy route handler, the middleware refresh boundary,
 *     and Server Actions can all read and rotate them.
 *
 * Cookie attributes/lifetimes live in `@/lib/constants` (`BASE_TOKEN_COOKIE`,
 * `*_COOKIE_MAX_AGE`) so this module and `src/middleware.ts` stamp identical
 * cookies.
 *
 * `cookies()` is async in Next 16 and must be awaited. Cookie mutation
 * (`set`/`delete`) is only legal inside a Server Action or Route Handler. During
 * a Server Component render the cookie store is SEALED read-only and
 * `set`/`delete` throw `ReadonlyRequestCookiesError` ("Cookies can only be
 * modified in a Server Action or Route Handler"). The writers below tolerate
 * that phase (see `setSession`/`clearSession`) — transparent refresh that would
 * otherwise need to write during render is performed earlier, at the middleware
 * boundary (`src/middleware.ts`), which CAN write cookies onto the navigation
 * response.
 */

/** Read the current access token (the Bearer for backend calls), if any. */
export async function getAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_ACCESS_TOKEN)?.value;
}

/** Read the current refresh token (used by the transparent refresh flow). */
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
 * True when the current request phase allows cookie mutation (Server Action /
 * Route Handler), false during a read-only Server Component render.
 *
 * Probed by deleting a sentinel cookie that is never set: in a writable phase
 * `delete` is a harmless no-op; in the sealed render phase it throws
 * `ReadonlyRequestCookiesError`. Callers use this to AVOID consuming a
 * single-use refresh token when the rotation could not be persisted anyway —
 * during render the middleware boundary owns refresh, so the API client should
 * not race it.
 */
export async function cookiesAreWritable(): Promise<boolean> {
  const store = await cookies();
  try {
    store.delete("__sd_probe");
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist the backend-issued token pair.
 *
 * Call site contract: cookie writes are only legal in a Server Action or Route
 * Handler. When this is (incorrectly) reached during a Server Component render
 * the store is sealed and `set` throws `ReadonlyRequestCookiesError`. We swallow
 * THAT specific error and return `false` instead of letting it corrupt the
 * caller's flow: returns `true` when the cookies were actually persisted,
 * `false` when the write was skipped because the phase is read-only.
 */
export async function setSession(tokens: IssuedTokens): Promise<boolean> {
  const store = await cookies();
  try {
    store.set(COOKIE_ACCESS_TOKEN, tokens.accessToken, {
      ...BASE_TOKEN_COOKIE,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    store.set(COOKIE_REFRESH_TOKEN, tokens.refreshToken, {
      ...BASE_TOKEN_COOKIE,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
    return true;
  } catch {
    // Read-only render phase (ReadonlyRequestCookiesError). Persistence happens
    // at the middleware boundary on the next navigation; never log the tokens.
    return false;
  }
}

/**
 * Drop both token cookies (logout, or when refresh fails). Same call-site
 * constraint as {@link setSession}: a read-only render phase makes `delete`
 * throw, which we swallow and report via the boolean return.
 */
export async function clearSession(): Promise<boolean> {
  const store = await cookies();
  try {
    store.delete(COOKIE_ACCESS_TOKEN);
    store.delete(COOKIE_REFRESH_TOKEN);
    return true;
  } catch {
    return false;
  }
}
