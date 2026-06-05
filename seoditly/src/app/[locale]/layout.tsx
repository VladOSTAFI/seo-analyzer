import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";

import { PRODUCT_NAME } from "@/lib/constants";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_HREFLANG,
  isLocale,
} from "@/lib/i18n/config";
import { metadataBase, alternatesFor } from "@/lib/i18n/metadata";
import { getCommon } from "@/lib/copy/common";
import { getHome } from "@/lib/copy/home";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
});

/**
 * Root layout, parameterised by the `[locale]` segment. This is THE root layout
 * (owns `<html>`/`<body>`); the proxy rewrites unprefixed default-locale URLs
 * to `/en/…` so a concrete locale always resolves here.
 *
 * It sets `<html lang>` to the active locale from its `[locale]` route param
 * and wraps the tree in `LocaleProvider` for client components (the language
 * switcher). Nested server components resolve the locale via `getRequestLocale`
 * (the `x-locale` request header stamped by the proxy), not from here.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const common = getCommon(locale);
  const home = getHome(locale);

  return {
    metadataBase: metadataBase(),
    title: {
      default: `${PRODUCT_NAME} — ${home.meta.title}`,
      template: `%s · ${PRODUCT_NAME}`,
    },
    description: common.metaDescription,
    alternates: alternatesFor("/", locale),
  };
}

export default async function LocaleRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;

  return (
    <html
      lang={LOCALE_HREFLANG[locale]}
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <LocaleProvider locale={locale}>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
