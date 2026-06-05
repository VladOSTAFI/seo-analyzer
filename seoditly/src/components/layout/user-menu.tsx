"use client";

import Link from "next/link";
import { LayoutDashboard, ListChecks, LogOut, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { DASHBOARD_HREF, AUDITS_HREF } from "@/lib/constants";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Signed-in nav control: a "Dashboard" link plus a dropdown showing the user's
 * email and a "Sign out" item that invokes the logout Server Action (revokes
 * refresh tokens server-side, clears cookies, redirects to /login).
 *
 * Locale-aware: hrefs are prefixed for `locale`; labels are passed in from the
 * server (already localized). `fullWidth` stacks the controls for mobile.
 */
export function UserMenu({
  email,
  locale,
  labels,
  fullWidth = false,
}: {
  email: string;
  locale: Locale;
  labels: {
    dashboard: string;
    audits: string;
    accountMenu: string;
    signedInAs: string;
    signOut: string;
  };
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        fullWidth && "flex-col items-stretch",
      )}
    >
      <Button
        asChild
        variant="outline"
        className={cn("h-11 rounded-lg px-4 text-sm font-medium", fullWidth && "w-full")}
      >
        <Link href={localeHref(DASHBOARD_HREF, locale)}>
          <LayoutDashboard aria-hidden />
          {labels.dashboard}
        </Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-11 max-w-[12rem] rounded-lg px-3 text-sm font-medium",
              fullWidth && "w-full max-w-none justify-between",
            )}
            aria-label={labels.accountMenu}
          >
            <span className="truncate text-muted-foreground">{email}</span>
            <ChevronDown aria-hidden className="opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>{labels.signedInAs}</DropdownMenuLabel>
          <div className="truncate px-1.5 pb-1 text-sm text-foreground">
            {email}
          </div>
          <DropdownMenuItem asChild>
            <Link href={localeHref(AUDITS_HREF, locale)}>
              <ListChecks aria-hidden />
              {labels.audits}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" className="w-full">
                <LogOut aria-hidden />
                {labels.signOut}
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
