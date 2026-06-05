import type { Metadata } from "next";

import { home } from "@/lib/copy/home";
import { Hero } from "@/components/home/hero";
import { StatRow } from "@/components/home/stat-row";
import { PlatformVisual } from "@/components/home/platform-visual";
import { ReportShowcase } from "@/components/home/report-showcase";
import { PipelineTeaser } from "@/components/home/pipeline-teaser";
import { CTABand } from "@/components/home/cta-band";

export const metadata: Metadata = {
  // Composed with the layout's `%s · seoditly` title template.
  title: home.meta.title,
  description: home.meta.description,
};

/** Phase 1 marketing home — six stacked sections, top → bottom. */
export default function HomePage() {
  return (
    <>
      <Hero />
      <StatRow />
      <PlatformVisual />
      <ReportShowcase />
      <PipelineTeaser />
      <CTABand />
    </>
  );
}
