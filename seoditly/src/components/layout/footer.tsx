import Link from "next/link";

import { NAV_ITEMS, PRODUCT_NAME } from "@/lib/constants";
import { common } from "@/lib/copy/common";
import { Container } from "@/components/primitives/container";

/** Site footer: product name, tagline, minimal links, copyright. */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/80 bg-background">
      <Container>
        <div className="flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="text-base font-semibold tracking-tight text-foreground">
              {PRODUCT_NAME}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {common.footerTagline}
            </p>
          </div>

          <nav className="flex flex-col gap-3" aria-label="Footer">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-border/60 py-6">
          <p className="text-xs text-muted-foreground">
            &copy; {year} {PRODUCT_NAME}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
