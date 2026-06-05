"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, PRODUCT_NAME, SIGN_IN_HREF } from "@/lib/constants";
import { Container } from "@/components/primitives/container";
import { CTAButton } from "@/components/primitives/cta-button";
import { Button } from "@/components/ui/button";

/**
 * Top navigation: text logo, primary links, and a right-side "Sign in" CTA,
 * collapsing to a toggle menu under `md`.
 *
 * Designed for a later auth-aware extension (Phase 4): the right-side slot
 * ({@link AuthSlot}) is isolated so a server component can swap "Sign in" for a
 * "Dashboard" link + user menu when a session cookie is present, without
 * touching the links or mobile-menu logic.
 */
export function Nav() {
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
          <div className="hidden md:block">
            <AuthSlot />
          </div>

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
              <AuthSlot fullWidth />
            </div>
          </div>
        </Container>
      </div>
    </header>
  );
}

/**
 * Right-hand auth control. Currently a static "Sign in" CTA; Phase 4 replaces
 * the body of this component with session-aware rendering.
 */
function AuthSlot({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <CTAButton
      href={SIGN_IN_HREF}
      variant="primary"
      className={fullWidth ? "w-full" : undefined}
    >
      Sign in
    </CTAButton>
  );
}
