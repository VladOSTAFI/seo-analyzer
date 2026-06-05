import { home } from "@/lib/copy/home";
import { Container } from "@/components/primitives/container";
import { PillBadge } from "@/components/primitives/pill-badge";
import { CTAButton } from "@/components/primitives/cta-button";

const { hero } = home;

/**
 * Asymmetric hero with a clear left-weighted focal point and a soft violet
 * glow anchoring the top-left. Content fades + lifts in on load via CSS only
 * (`.hero-rise`), disabled under `prefers-reduced-motion` (see globals.css).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft violet radial, top-left — the asymmetric light source. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,hsl(265_85%_65%/0.18),transparent_70%)] blur-2xl"
      />
      {/* Thin grid sheen on the right, for depth without clutter. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(to_left,hsl(265_85%_65%/0.04),transparent)]"
      />

      <Container className="relative py-24 md:py-36">
        <div className="max-w-3xl">
          <div className="hero-rise" style={{ animationDelay: "0ms" }}>
            <PillBadge dot>{hero.badge}</PillBadge>
          </div>

          <h1
            className="hero-rise mt-6 text-5xl font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.05]"
            style={{ animationDelay: "80ms" }}
          >
            {hero.headline}
          </h1>

          <p
            className="hero-rise mt-6 max-w-2xl text-lg text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            {hero.subhead}
          </p>

          <div
            className="hero-rise mt-10 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "240ms" }}
          >
            <CTAButton href={hero.primaryCta.href} variant="primary">
              {hero.primaryCta.label}
            </CTAButton>
            <CTAButton href={hero.secondaryCta.href} variant="secondary">
              {hero.secondaryCta.label}
            </CTAButton>
          </div>
        </div>
      </Container>
    </section>
  );
}
