"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, PRODUCT_NAME } from "@/lib/constants";
import { Container } from "@/components/primitives/container";
import { Button } from "@/components/ui/button";

/**
 * Client shell for the top navigation: text logo, primary links, and the
 * collapsing mobile menu. The auth-aware right-hand controls are resolved by
 * the server {@link Nav} component and injected as `desktopAuth` / `mobileAuth`
 * props, so this component owns only the open/close UI state — no session or
 * token access happens in client code.
 */
export function NavShell({
  desktopAuth,
  mobileAuth,
}: {
  desktopAuth: React.ReactNode;
  mobileAuth: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container>
        <nav className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="rounded-sm text-base font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen(false)}
          >
            {PRODUCT_NAME}
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => (
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
          <div className="hidden md:block">{desktopAuth}</div>

          {/* Mobile toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
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
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3" onClick={() => setOpen(false)}>
              {mobileAuth}
            </div>
          </div>
        </Container>
      </div>
    </header>
  );
}
