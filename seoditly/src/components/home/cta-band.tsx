import { home } from "@/lib/copy/home";
import { Container } from "@/components/primitives/container";
import { CTAButton } from "@/components/primitives/cta-button";

const { ctaBand } = home;

/** Violet-tinted closing band: headline + primary CTA to `/contact`. */
export function CTABand() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 px-6 py-16 text-center md:px-12 md:py-20">
          {/* Centered violet radial glow for the focal closing moment. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(265_85%_65%/0.20),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {ctaBand.headline}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              {ctaBand.body}
            </p>
            <div className="mt-8 flex justify-center">
              <CTAButton href={ctaBand.cta.href} variant="primary">
                {ctaBand.cta.label}
              </CTAButton>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
