import type { Metadata } from "next";

import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { alternatesFor } from "@/lib/i18n/metadata";
import { getHome } from "@/lib/copy/home";
import { Hero } from "@/components/home/hero";
import { StatRow } from "@/components/home/stat-row";
import { Problem } from "@/components/home/problem";
import { PlatformVisual } from "@/components/home/platform-visual";
import { ReportShowcase } from "@/components/home/report-showcase";
import { PipelineTeaser } from "@/components/home/pipeline-teaser";
import { CTABand } from "@/components/home/cta-band";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const home = getHome(locale);
  return {
    title: home.meta.title,
    description: home.meta.description,
    alternates: alternatesFor("/", locale),
  };
}

/** Phase 1 marketing home — stacked sections, top → bottom. */
export default function HomePage() {
  return (
    <>
      <Hero />
      <StatRow />
      <Problem />
      <PlatformVisual />
      <ReportShowcase />
      <PipelineTeaser />
      <CTABand />
    </>
  );
}
