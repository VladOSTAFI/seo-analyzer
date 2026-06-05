import type { Metadata } from "next";

import { howItWorks } from "@/lib/copy/how-it-works";
import { Container } from "@/components/primitives/container";
import { PillBadge } from "@/components/primitives/pill-badge";
import { CTAButton } from "@/components/primitives/cta-button";
import { StageList } from "@/components/how-it-works/stage-list";
import { ChecksGrid } from "@/components/how-it-works/checks-grid";
import { ReportPreview } from "@/components/how-it-works/report-preview";
import { Expectations } from "@/components/how-it-works/expectations";

export const metadata: Metadata = {
  // Composed with the layout's `%s · seoditly` title template.
  title: howItWorks.meta.title,
  description: howItWorks.meta.description,
};

const { intro, cta } = howItWorks;

/**
 * Phase 2 — How It Works. Sets process + output expectations for a first-time
 * visitor: intro → pipeline stages → checks overview → report preview →
 * expectations → closing CTA.
 */
export default function HowItWorksPage() {
  return (
    <>
      {/* Intro — what an audit is and what you walk away with. */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,hsl(265_85%_65%/0.16),transparent_70%)] blur-2xl"
        />
        <Container className="relative py-20 md:py-28">
          <div className="max-w-3xl">
            <PillBadge>{intro.badge}</PillBadge>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground md:text-5xl md:leading-[1.1]">
              {intro.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              {intro.subhead}
            </p>
          </div>
        </Container>
      </section>

      <StageList />
      <ChecksGrid />
      <ReportPreview />
      <Expectations />

      {/* Closing CTA → /contact. */}
      <section className="py-20 md:py-28">
        <Container>
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 px-6 py-16 text-center md:px-12 md:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.20),transparent_70%)]"
            />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {cta.headline}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
                {cta.body}
              </p>
              <div className="mt-8 flex justify-center">
                <CTAButton href={cta.primary.href} variant="primary">
                  {cta.primary.label}
                </CTAButton>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
