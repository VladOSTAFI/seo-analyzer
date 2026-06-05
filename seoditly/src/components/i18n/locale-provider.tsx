"use client";

import { createContext, useContext } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/**
 * Carries the active locale to client components (the language switcher, and
 * any client UI that needs to build locale-aware hrefs) without prop-drilling.
 * Set once near the top of the tree by the root locale layout; client
 * components also derive the locale from the URL via `usePathname`, but this
 * context gives a synchronous, render-stable value.
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
