import {
  Heading,
  ImageIcon,
  Languages,
  Link2,
  Gauge,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { getRequestLocale } from "@/lib/i18n/server";
import { getHowItWorks } from "@/lib/copy/how-it-works";
import { getCheckCategories } from "@/lib/checks";
import { Section } from "@/components/primitives/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Maps each check category `key` to its icon — sourced alongside the data. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  metadata: Heading,
  canonical: ShieldCheck,
  links: Link2,
  images: ImageIcon,
  performance: Gauge,
  i18n: Languages,
};

/**
 * The ~31 checks grouped by category into a responsive card grid. Each card
 * lists its individual checks as a definition list — breadth at a glance
 * without overwhelming a first-time reader. Data comes from `lib/checks.ts`.
 */
export async function ChecksGrid() {
  const locale = await getRequestLocale();
  const { checks } = getHowItWorks(locale);
  const categories = getCheckCategories(locale);

  return (
    <Section eyebrow={checks.eyebrow} heading={checks.heading}>
      <p className="-mt-6 mb-12 max-w-2xl text-lg text-muted-foreground">
        {checks.body}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((group) => {
          const Icon = CATEGORY_ICONS[group.key] ?? ShieldCheck;
          return (
            <Card
              key={group.key}
              className="h-full ring-border transition-colors hover:ring-primary/40"
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <CardTitle className="text-base">{group.category}</CardTitle>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {group.blurb}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 border-t border-border pt-4">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-foreground/90"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
