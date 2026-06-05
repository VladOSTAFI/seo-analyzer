import "server-only";
import type { Metadata } from "next";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_HREFLANG,
  localeHref,
  type Locale,
} from "@/lib/i18n/config";

/**
 * Absolute site origin used as `metadataBase` so per-locale `canonical` and
 * `hreflang` alternates resolve to absolute URLs (what crawlers expect).
 *
 * Server-only and NON-secret: it's a public origin, but it's read here (not
 * `NEXT_PUBLIC_`) to keep all config server-side. Falls back to a localhost
 * origin in dev so the build never fails for a missing env var.
 */
export function siteOrigin(): string {
  const raw = process.env.SITE_URL ?? "http://localhost:3001";
  return raw.replace(/\/+$/, "");
}

export function metadataBase(): URL {
  return new URL(siteOrigin());
}

/**
 * Build the `alternates` block (canonical + per-locale `hreflang` + `x-default`)
 * for a given locale-agnostic path. `metadataBase` is set so the relative hrefs
 * resolve to absolute URLs in the emitted `<link>` tags.
 *
 *   alternatesFor("/how-it-works", "uk") →
 *     canonical: /uk/how-it-works
 *     languages: { en: /how-it-works, uk: /uk/how-it-works, x-default: /how-it-works }
 */
export function alternatesFor(
  path: string,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) {
    languages[LOCALE_HREFLANG[l]] = localeHref(path, l);
  }
  // x-default points at the default (English, unprefixed) locale.
  languages["x-default"] = localeHref(path, DEFAULT_LOCALE);

  return {
    canonical: localeHref(path, locale),
    languages,
  };
}
