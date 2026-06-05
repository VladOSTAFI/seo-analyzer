"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Globe } from "lucide-react";

import {
  LOCALES,
  LOCALE_LABEL,
  LOCALE_SHORT,
  getLocaleFromPath,
  switchLocaleHref,
} from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Language switcher. Reads the current path with `usePathname`, derives the
 * active locale, and offers a same-path link to each other locale (so
 * `/uk/how-it-works` ⇄ `/how-it-works`). Real `<Link>`s — works without JS,
 * crawlable, and each option is a navigable URL.
 *
 * Accessibility: the trigger has an explicit `aria-label`; the active option is
 * marked `aria-current` and shows a check. `switcherLabel` / `heading` are
 * passed in (resolved server-side) so the control's own chrome is localized too.
 */
export function LanguageSwitcher({
  switcherLabel,
  heading,
  className,
}: {
  switcherLabel: string;
  heading: string;
  className?: string;
}) {
  const pathname = usePathname() || "/";
  const active = getLocaleFromPath(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={switcherLabel}
          className={cn(
            "h-10 gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground",
            className,
          )}
        >
          <Globe aria-hidden className="size-4" />
          <span aria-hidden>{LOCALE_SHORT[active]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{heading}</DropdownMenuLabel>
        {LOCALES.map((locale) => {
          const isActive = locale === active;
          return (
            <DropdownMenuItem key={locale} asChild>
              <Link
                href={switchLocaleHref(pathname, locale)}
                hrefLang={locale}
                aria-current={isActive ? "true" : undefined}
                className="flex items-center justify-between"
              >
                <span>{LOCALE_LABEL[locale]}</span>
                {isActive && (
                  <Check aria-hidden className="size-4 text-primary" />
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
