/**
 * i18n core — locale set, defaults, and path helpers.
 *
 * Dependency-free and browser-safe (no `next/headers`, no `server-only`) so it
 * can be imported by the proxy/middleware, server components, AND client
 * components (the language switcher, locale-aware `Link` building).
 *
 * URL strategy: PATH PREFIX, DEFAULT-LOCALE-UNPREFIXED.
 *   - English (the default) lives at the root URLs:  `/`, `/how-it-works`,
 *     `/login`, `/dashboard`, `/audits/:id`, …
 *   - Ukrainian lives under a `/uk` prefix:           `/uk`, `/uk/how-it-works`,
 *     `/uk/login`, `/uk/dashboard`, `/uk/audits/:id`, …
 *
 * Internally every route lives under `app/[locale]/…`. The proxy rewrites an
 * unprefixed inbound URL to its `/en/…` internal form so the default locale
 * stays prefix-free in the address bar while the App Router still resolves a
 * concrete `[locale]` segment. See `src/middleware.ts`.
 */

export const LOCALES = ["en", "uk"] as const;

export type Locale = (typeof LOCALES)[number];

/** The default locale — served WITHOUT a path prefix, and the i18n fallback. */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Request header the proxy/middleware stamps with the resolved active locale on
 * every request so server components can read it back via `getRequestLocale`
 * (`await headers()`). Lives here (dependency-free) so BOTH the middleware and
 * the `server-only` reader can import it without coupling.
 */
export const LOCALE_HEADER = "x-locale";

/** `<html lang>` / `hreflang` BCP-47 tags per locale (for SEO alternates). */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  uk: "uk",
};

/** Human-readable language names (used in the switcher's labels). */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
};

/** Short code shown in the compact switcher trigger. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  uk: "UK",
};

/** Narrow an arbitrary string to a supported {@link Locale}. */
export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Extract the locale that a (public-facing) pathname denotes, defaulting to
 * {@link DEFAULT_LOCALE} when there is no prefix.
 *
 *   `/uk/how-it-works` → "uk"
 *   `/how-it-works`    → "en"
 *   `/uk`              → "uk"
 *   `/`                → "en"
 */
export function getLocaleFromPath(pathname: string): Locale {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : DEFAULT_LOCALE;
}

/**
 * Strip a leading locale prefix from a pathname, returning the locale-agnostic
 * path (always starting with `/`). Unprefixed paths (default locale) are
 * returned unchanged.
 *
 *   `/uk/how-it-works` → "/how-it-works"
 *   `/how-it-works`    → "/how-it-works"
 *   `/uk`              → "/"
 *   `/`                → "/"
 */
export function stripLocaleFromPath(pathname: string): string {
  const segments = pathname.split("/");
  if (isLocale(segments[1])) {
    const rest = "/" + segments.slice(2).join("/");
    return rest === "/" ? "/" : rest.replace(/\/$/, "") || "/";
  }
  return pathname;
}

/**
 * Build the public-facing href for a locale-agnostic path under a given locale.
 * The default locale stays unprefixed; others get the `/<locale>` prefix.
 *
 *   localeHref("/how-it-works", "en") → "/how-it-works"
 *   localeHref("/how-it-works", "uk") → "/uk/how-it-works"
 *   localeHref("/", "uk")             → "/uk"
 *   localeHref("/", "en")             → "/"
 *
 * Query strings / hashes on `path` are preserved.
 */
export function localeHref(path: string, locale: Locale): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return normalized;
  if (normalized === "/") return `/${locale}`;
  return `/${locale}${normalized}`;
}

/**
 * Re-point an already-public path (which may already carry a locale prefix) at
 * a target locale, preserving the rest of the path. Used by the language
 * switcher to flip `/uk/how-it-works` ⇄ `/how-it-works`.
 */
export function switchLocaleHref(currentPath: string, target: Locale): string {
  return localeHref(stripLocaleFromPath(currentPath), target);
}
