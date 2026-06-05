import "server-only";
import { headers } from "next/headers";

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_HEADER,
  type Locale,
} from "@/lib/i18n/config";

/**
 * Per-request active locale for server components / metadata functions, read
 * WITHOUT prop-drilling.
 *
 * Mechanism (mirrors next-intl): the proxy/middleware (`src/middleware.ts`)
 * resolves the locale from the inbound URL and stamps it onto a request header
 * (`x-locale`, see {@link LOCALE_HEADER}) on EVERY request — both the
 * default-locale `/en` rewrite branch and the `/uk` passthrough, including the
 * gated auth/refresh branches. Here we read that header back via the async
 * `headers()` request API.
 *
 * Why a header and not a `cache()` holder: in Next 16's render model a layout
 * mutating a `cache()`d value is NOT reliably visible to nested server
 * components, so the old holder silently fell back to `DEFAULT_LOCALE` (English
 * body copy on `/uk`). A request header is part of the request scope every
 * server component shares, so it is always seen.
 *
 * Because `headers()` is async this function is async — all call sites must
 * `await getRequestLocale()`.
 *
 * Client components never use this — they read the locale from the URL via the
 * `LocaleProvider` context (see `components/i18n/locale-provider.tsx`).
 */
export async function getRequestLocale(): Promise<Locale> {
  const value = (await headers()).get(LOCALE_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
