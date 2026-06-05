import { cn } from "@/lib/utils";
import { Container } from "@/components/primitives/container";

interface SectionProps {
  id?: string;
  /** Small violet uppercase label above the heading. */
  eyebrow?: string;
  /** Section heading; rendered as an h2 with tight tracking. */
  heading?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Vertical page rhythm (`py-20 md:py-28`) wrapped in a {@link Container}.
 * Renders an optional violet eyebrow + heading block before its children.
 */
export function Section({
  id,
  eyebrow,
  heading,
  children,
  className,
}: SectionProps) {
  return (
    <section id={id} className={cn("py-20 md:py-28", className)}>
      <Container>
        {(eyebrow || heading) && (
          <div className="mb-10 max-w-2xl md:mb-14">
            {eyebrow && (
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                {eyebrow}
              </p>
            )}
            {heading && (
              <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {heading}
              </h2>
            )}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}
