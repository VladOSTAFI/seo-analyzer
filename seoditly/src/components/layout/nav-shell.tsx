"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Container } from "@/components/primitives/container";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

/**
 * Client shell for the top navigation: logo lockup, primary links, language
 * switcher, and the collapsing mobile menu. All locale-aware data (hrefs,
 * labels) is resolved server-side in {@link Nav} and passed in as props, so this
 * component owns only the open/close UI state — no session or token access in
 * client code.
 */
export function NavShell({
  homeHref,
  homeLabel,
  navItems,
  openMenuLabel,
  closeMenuLabel,
  languageSwitcherLabel,
  languageHeading,
  desktopAuth,
  mobileAuth,
}: {
  homeHref: string;
  homeLabel: string;
  navItems: { label: string; href: string }[];
  openMenuLabel: string;
  closeMenuLabel: string;
  languageSwitcherLabel: string;
  languageHeading: string;
  desktopAuth: React.ReactNode;
  mobileAuth: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container>
        <nav className="flex h-16 items-center justify-between gap-6">
          <Link
            href={homeHref}
            aria-label={homeLabel}
            className="inline-flex items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen(false)}
          >
            <Logo />
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Desktop right slot */}
          <div className="hidden items-center gap-1 md:flex">
            <LanguageSwitcher
              switcherLabel={languageSwitcherLabel}
              heading={languageHeading}
            />
            {desktopAuth}
          </div>

          {/* Mobile toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? closeMenuLabel : openMenuLabel}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </nav>
      </Container>

      {/* Mobile menu */}
      <div
        className={cn(
          "overflow-hidden border-t border-border/80 md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <Container>
          <div className="flex flex-col gap-1 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 px-2">
              <LanguageSwitcher
                switcherLabel={languageSwitcherLabel}
                heading={languageHeading}
              />
            </div>
            <div className="mt-3" onClick={() => setOpen(false)}>
              {mobileAuth}
            </div>
          </div>
        </Container>
      </div>
    </header>
  );
}
