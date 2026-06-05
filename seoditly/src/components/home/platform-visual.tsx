import { home } from "@/lib/copy/home";
import { Section } from "@/components/primitives/section";
import { MediaFrame } from "@/components/primitives/media-frame";

const { platform } = home;

/**
 * The platform shot — a 16:9 violet-ringed `MediaFrame`. No `src` is passed,
 * so it renders the correctly-sized placeholder reserving the 1280×720 box
 * (zero CLS when `public/media/dashboard.png` lands).
 */
export function PlatformVisual() {
  return (
    <Section eyebrow={platform.eyebrow} heading={platform.heading}>
      <div className="relative">
        {/* Subtle violet bloom behind the frame for depth. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-8 -inset-y-6 bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.10),transparent_70%)] blur-2xl"
        />
        <MediaFrame
          alt={platform.mediaAlt}
          className="relative shadow-2xl shadow-primary/10"
        />
      </div>
    </Section>
  );
}
