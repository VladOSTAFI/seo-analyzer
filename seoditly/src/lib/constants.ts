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
