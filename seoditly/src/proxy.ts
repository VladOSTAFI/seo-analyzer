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
import {
  DEFAULT_LOCALE,
  isLocale,
  getLocaleFromPath,
  stripLocaleFromPath,
  localeHref,
  LOCALE_HEADER,
  type Locale,
} from "@/lib/i18n/config";

/**
 * Composed proxy/middleware: LOCALE ROUTING + the existing TRANSPARENT TOKEN
 * REFRESH gate for the `(dashboard)` route group. Two concerns, one pass.
 *
 * ── Locale routing (path-prefix, default-unprefixed) ──────────────────────────
 *   Internally every route lives under `app/[locale]/…`. English (the default)
 *   is served at the bare URLs (`/`, `/dashboard`, …); Ukrainian under `/uk/…`.
 *   For a default-locale URL (no `/uk` prefix) we REWRITE the request to its
 *   `/en/…` internal form so the App Router resolves a concrete `[locale]`
 *   segment, while the address bar stays prefix-free. `/uk/…` URLs already
 *   carry a valid prefix and pass through to `[locale]=uk` unchanged.
 *
 *   On EVERY response we also stamp the resolved locale onto the inbound request
 *   headers as `x-locale`. Server components read it back via `getRequestLocale`
 *   (`await headers()`), which is the reliable, request-scoped way to propagate
 *   the locale without prop-drilling — a layout mutating a `cache()` holder is
 *   NOT reliably visible to nested server components in Next 16, so that older
 *   mechanism silently fell back to English body copy on `/uk`.
 *
 * ── Auth refresh (unchanged behavior, now locale-aware) ───────────────────────
 * Why refresh lives here (Next 16 constraint):
 *   `cookies().set()` is illegal during a Server Component render — the store is
 *   sealed read-only and throws. The dashboard/audits pages are Server
 *   Components that fetch via the Bearer API client, so they CANNOT rotate the
 *   cookie pair when the access token has expired: a rotation attempted there is
 *   dropped, and because the backend issues SINGLE-USE refresh tokens, the next
 *   navigation reuses an already-invalidated `sd_rt` and the session collapses
 *   to a forced logout. The proxy runs BEFORE render and owns the navigation
 *   response, so it can both (a) write the rotated pair as `Set-Cookie` for the
 *   browser and (b) rewrite the inbound request cookies so the render that
 *   follows reads the FRESH access token. That makes refresh actually stick.
 *
 * Gated-flow per matched navigation (for BOTH `/dashboard…`/`/audits…` AND
 * their `/uk/…` counterparts — gating is decided on the locale-STRIPPED path):
 *   1. No session cookies at all → anonymous → redirect to the locale-correct
 *      login (`/login` for en, `/uk/login` for uk).
 *   2. Access token present and NOT expired → pass through (still rewriting the
 *      default locale to `/en` internally).
 *   3. Access token missing/expired but a refresh token is present → call
 *      `/auth/refresh` ONCE. On success: stamp the rotated pair onto the request
 *      (for this render) and the response (for the browser), and rewrite to the
 *      `[locale]` form. On unreachable: preserve the session and pass through.
 *      On rejected: clear both cookies and redirect to the locale-correct login.
 *
 * The cookies are httpOnly, so nothing here exposes a token to client JS, and
 * token values are never logged.
 *
 * Coverage: the matcher spans all app paths (minus `_next`, `api`, assets) so
 * locale routing applies everywhere; the auth gate is applied only to the
 * `/dashboard` + `/audits` subtrees (in either locale). The `/api/proxy/*`
 * route keeps its own in-handler refresh for browser XHR and is excluded here.
 */

/** Locale-stripped paths that require an authenticated session. */
const GATED_PREFIXES = ["/dashboard", "/audits"];

function isGatedPath(localeStrippedPath: string): boolean {
  return GATED_PREFIXES.some(
    (prefix) =>
      localeStrippedPath === prefix ||
      localeStrippedPath.startsWith(`${prefix}/`),
  );
}

/** Decode the access JWT and report whether it is still valid (exp in future). */
function accessTokenIsLive(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const claims = decodeJwt<{ exp?: number }>(token);
    if (typeof claims.exp !== "number") return true;
    return claims.exp * 1000 > Date.now() + 5_000;
  } catch {
    return false;
  }
}

/**
 * Build the internal (rewritten) URL for a request: default-locale paths get
 * the `/en` prefix added; already-prefixed paths are left as-is. Returns `null`
 * when no rewrite is needed (i.e. the path already starts with a locale).
 */
function internalRewriteUrl(request: NextRequest, locale: Locale): URL | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];
  if (isLocale(firstSegment)) return null; // already `/en/…` or `/uk/…`

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return url;
}

/**
 * Pass the request through (rewriting unprefixed default-locale URLs to their
 * `/en` internal form), stamping the resolved `locale` onto the inbound request
 * headers as `x-locale` so server components can read it via `getRequestLocale`.
 *
 * `cookieOverrides`, when present, also rewrites the inbound `Cookie` header so
 * the downstream render sees freshly-rotated tokens (used by the refresh path).
 */
function passWithLocale(
  request: NextRequest,
  locale: Locale,
  rewriteUrl: URL | null,
  cookieOverrides?: Record<string, string>,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  if (cookieOverrides) {
    requestHeaders.set(
      "cookie",
      rewriteCookieHeader(request.headers.get("cookie"), cookieOverrides),
    );
  }

  return rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const locale = getLocaleFromPath(pathname);
  const localeStripped = stripLocaleFromPath(pathname);
  const rewriteUrl = internalRewriteUrl(request, locale);

  // ── Non-gated routes: locale rewrite + x-locale stamp only ──────────────────
  if (!isGatedPath(localeStripped)) {
    return passWithLocale(request, locale, rewriteUrl);
  }

  // ── Gated routes: auth/refresh gate, then the same locale rewrite + stamp ───
  const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

  // (1) No session at all → anonymous → locale-correct login.
  if (!accessToken && !refreshToken) {
    return redirectToLogin(request, locale, localeStripped);
  }

  // (2) Access token still valid → pass through (with locale rewrite + stamp).
  if (accessTokenIsLive(accessToken)) {
    return passWithLocale(request, locale, rewriteUrl);
  }

  // (3) Access token missing/expired. No refresh token → end session.
  if (!refreshToken) {
    return endSession(request, locale, localeStripped);
  }

  const result = await refreshTokensResult(refreshToken);

  if (!result.ok) {
    // Backend unreachable → transient outage, NOT an auth failure. Preserve the
    // session and let the request through (page degrades to backend-down).
    if (result.reason === "unreachable") {
      return passWithLocale(request, locale, rewriteUrl);
    }
    // Genuinely rejected (invalid / expired / revoked) → end the session.
    return endSession(request, locale, localeStripped);
  }

  // Success: make the FRESH access token visible to the render that follows by
  // rewriting the inbound request cookies, stamp the locale, persist the rotated
  // pair to the browser via `Set-Cookie`, AND apply the locale rewrite — all on
  // one response.
  const { tokens } = result;
  const response = passWithLocale(request, locale, rewriteUrl, {
    [COOKIE_ACCESS_TOKEN]: tokens.accessToken,
    [COOKIE_REFRESH_TOKEN]: tokens.refreshToken,
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

/**
 * Redirect to the locale-correct login, preserving where the user was headed.
 * The `next` param carries the locale-stripped target so post-login we can send
 * them back within their locale.
 */
function redirectToLogin(
  request: NextRequest,
  locale: Locale,
  localeStripped: string,
): NextResponse {
  const loginPath = localeHref(LOGIN_HREF, locale);
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set("next", localeStripped);
  return NextResponse.redirect(loginUrl);
}

/** Redirect to the locale-correct login AND clear both token cookies. */
function endSession(
  request: NextRequest,
  locale: Locale,
  localeStripped: string,
): NextResponse {
  const response = redirectToLogin(request, locale, localeStripped);
  response.cookies.delete(COOKIE_ACCESS_TOKEN);
  response.cookies.delete(COOKIE_REFRESH_TOKEN);
  return response;
}

/**
 * Return a `Cookie` request-header string with the given names overwritten to
 * the supplied values (others preserved) so the downstream render reads the
 * rotated tokens instead of the stale inbound ones.
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

  for (const name of pending) {
    parts.push(`${name}=${overrides[name]}`);
  }

  return parts.join("; ");
}

// Keep the default-locale constant referenced so a future refactor that drops
// `getLocaleFromPath`'s default can't silently change the unprefixed behavior.
void DEFAULT_LOCALE;

export const config = {
  /**
   * Run on every app path so locale rewriting is universal, EXCEPT:
   *   - `api`        — route handlers (incl. `/api/proxy/*`, own refresh).
   *   - `_next/*`    — framework internals and static/image optimization.
   *   - asset files  — anything with a file extension (favicon, icons, media).
   * The gate (auth) is applied inside the function only to dashboard/audits.
   */
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
