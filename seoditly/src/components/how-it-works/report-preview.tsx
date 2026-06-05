import { Check, Download } from "lucide-react";

import { getRequestLocale } from "@/lib/i18n/server";
import { getHowItWorks } from "@/lib/copy/how-it-works";
import { Container } from "@/components/primitives/container";
import { MediaFrame } from "@/components/primitives/media-frame";
import { Button } from "@/components/ui/button";

/**
 * "What the report looks like": a screenshot of the deliverable (MediaFrame
 * placeholder until `public/media/report.png` lands) alongside framing copy,
 * the value bullets, and a download link for a sample `.xlsx`. Two columns that
 * stack on mobile.
 */
export async function ReportPreview() {
  const { report } = getHowItWorks(await getRequestLocale());

  return (
    <section className="py-20 md:py-28">
      <Container>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              {report.eyebrow}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {report.heading}
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">{report.body}</p>

            <ul className="mt-8 space-y-3">
              {report.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  <span className="text-foreground/90">{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-lg px-5 text-sm font-medium"
              >
                <a href={report.download.href} download>
                  <Download className="size-4" aria-hidden />
                  {report.download.label}
                </a>
              </Button>
              <span className="text-sm text-muted-foreground">
                {report.download.note}
              </span>
            </div>
          </div>

          <div className="relative order-first lg:order-last">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.10),transparent_70%)] blur-2xl"
            />
            <MediaFrame
              alt={report.mediaAlt}
              className="relative shadow-2xl shadow-primary/10"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
