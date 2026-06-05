import { getRequestLocale } from "@/lib/i18n/server";
import { getHome } from "@/lib/copy/home";
import { Section } from "@/components/primitives/section";
import { MediaFrame } from "@/components/primitives/media-frame";

/**
 * The platform shot — a 16:9 violet-ringed `MediaFrame` showing the live
 * product dashboard (`public/media/dashboard.png`): crawl coverage, findings
 * by severity, and report status at a glance.
 */
export async function PlatformVisual() {
  const { platform } = getHome(await getRequestLocale());

  return (
    <Section eyebrow={platform.eyebrow} heading={platform.heading}>
      <div className="relative">
        {/* Subtle violet bloom behind the frame for depth. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-8 -inset-y-6 bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.10),transparent_70%)] blur-2xl"
        />
        <MediaFrame
          src="/media/dashboard.png"
          alt={platform.mediaAlt}
          className="relative shadow-2xl shadow-primary/10"
        />
      </div>
    </Section>
  );
}
