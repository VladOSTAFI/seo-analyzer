import { getRequestLocale } from "@/lib/i18n/server";
import { getHome } from "@/lib/copy/home";
import { Section } from "@/components/primitives/section";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The problem framed for agencies and freelancers: the manual audit grind.
 * A lead paragraph followed by the three steps of that grind as numbered
 * cards (raw data → interpret → rebuild), in a 1-col → 3-col grid.
 */
export async function Problem() {
  const { problem } = getHome(await getRequestLocale());

  return (
    <Section eyebrow={problem.eyebrow} heading={problem.heading}>
      <p className="-mt-4 mb-10 max-w-2xl text-lg text-muted-foreground md:mb-14">
        {problem.body}
      </p>

      <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {problem.bullets.map((bullet, index) => (
          <li key={bullet}>
            <Card className="h-full ring-border">
              <CardContent className="flex h-full flex-col gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-medium tabular-nums text-primary ring-1 ring-primary/20">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-sm text-foreground/90">{bullet}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}
