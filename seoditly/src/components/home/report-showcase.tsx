import { Check } from "lucide-react";

import { home } from "@/lib/copy/home";
import { Container } from "@/components/primitives/container";
import { MediaFrame } from "@/components/primitives/media-frame";

const { report } = home;

/**
 * The report framed as the deliverable. Two columns that stack on mobile:
 * copy + bullets on the left, the report `MediaFrame` placeholder on the right.
 */
export function ReportShowcase() {
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
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.10),transparent_70%)] blur-2xl"
            />
            <MediaFrame
              src="/media/report.svg"
              alt={report.mediaAlt}
              className="relative shadow-2xl shadow-primary/10"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
