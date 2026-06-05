import Link from "next/link";

import { PRODUCT_NAME } from "@/lib/constants";
import { getRequestLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import { getCommon } from "@/lib/copy/common";
import { Container } from "@/components/primitives/container";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

/** Site footer: product name, tagline, locale-aware links, language switcher. */
export async function Footer() {
  const year = new Date().getFullYear();
  const locale = await getRequestLocale();
  const common = getCommon(locale);

  const navItems = [
    { label: common.navItems.howItWorks, href: localeHref("/how-it-works", locale) },
    { label: common.navItems.contact, href: localeHref("/contact", locale) },
  ];

  return (
    <footer className="mt-auto border-t border-border/80 bg-background">
      <Container>
        <div className="flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              {common.footerTagline}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <nav
              className="flex flex-col gap-3"
              aria-label={common.footer.footerNavLabel}
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <LanguageSwitcher
              switcherLabel={common.language.switcherLabel}
              heading={common.language.heading}
              className="-ml-2.5 self-start"
            />
          </div>
        </div>

        <div className="border-t border-border/60 py-6">
          <p className="text-xs text-muted-foreground">
            &copy; {year} {PRODUCT_NAME}. {common.footer.rightsReserved}
          </p>
        </div>
      </Container>
    </footer>
  );
}
