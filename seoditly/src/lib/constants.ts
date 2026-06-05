export const PRODUCT_NAME = "seoditly";

export const NAV_ITEMS = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Contact", href: "/contact" },
] as const;

/**
 * Where the nav "Sign in" CTA points. It targets the gated dashboard; the
 * middleware bounces anonymous visitors from `(dashboard)` routes to
 * {@link LOGIN_HREF}, so an unauthenticated click lands on the login form.
 */
export const SIGN_IN_HREF = "/dashboard";

export const DASHBOARD_HREF = "/dashboard";
export const AUDITS_HREF = "/audits";
export const LOGIN_HREF = "/login";
export const REGISTER_HREF = "/register";

/**
 * httpOnly cookie names holding the backend-issued token pair. Tokens live
 * ONLY here (never localStorage / client JS); see `lib/auth/session.ts`.
 *   - `sd_at` — short-lived access JWT (Bearer for `/audits`, `/auth/me`).
 *   - `sd_rt` — opaque, long-lived, rotating refresh token.
 */
export const COOKIE_ACCESS_TOKEN = "sd_at";
export const COOKIE_REFRESH_TOKEN = "sd_rt";

/**
 * Shared cookie attributes + lifetimes for the token pair. Defined here (a
 * dependency-free module, no `next/headers`) so BOTH the session writers
 * (`lib/auth/session.ts`, Server Actions) and the middleware refresh boundary
 * (`src/middleware.ts`) stamp an IDENTICAL cookie — same
 * `httpOnly`/`secure`/`sameSite`/`path` — so a rotation written by one boundary
 * cleanly overwrites the cookie set by another. These are attributes/lifetimes
 * only — NO secrets — so it is safe to keep them in this browser-importable
 * module.
 *
 * The cookie max-ages cap browser lifetime; the backend still enforces the real
 * token TTLs (access ≈ 15m, refresh ≈ 30d) and single-use refresh rotation.
 *
 * NOTE on `secure`: it is OFF in dev. A `Secure` cookie is dropped by the
 * browser over plain `http://localhost`, which would silently break the whole
 * session on a local backend — hence prod-only.
 */
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const BASE_TOKEN_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;
