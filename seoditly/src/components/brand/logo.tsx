import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/constants";

/**
 * Brand mark — the "audit lens": a magnifying-glass lens enclosing a rising
 * trend line (search × audit × growth), drawn in the theme's luminous violet
 * gradient. Pure SVG, scales to any size, inherits no color (uses its own
 * gradient) so it reads on the dark surface everywhere it appears.
 *
 * The gradient id is fixed; multiple marks on one page reference the same
 * (identical) def, which is harmless — the first one in DOM order resolves.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-hidden
      className={cn("size-7 shrink-0", className)}
    >
      <defs>
        <linearGradient
          id="sd-logo-grad"
          x1="4"
          y1="4"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D8B4FE" />
          <stop offset="0.55" stopColor="#A855F7" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>

      {/* Lens */}
      <circle
        cx="14"
        cy="14"
        r="8.5"
        stroke="url(#sd-logo-grad)"
        strokeWidth="2.6"
      />
      {/* Handle */}
      <path
        d="M20.4 20.4 26.4 26.4"
        stroke="url(#sd-logo-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Rising trend line inside the lens */}
      <path
        d="M9.8 16.6 12.8 13.2 15.4 15.2 18.4 10.8"
        stroke="url(#sd-logo-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Peak */}
      <circle cx="18.4" cy="10.8" r="1.6" fill="url(#sd-logo-grad)" />
    </svg>
  );
}

/**
 * Full lockup: the mark + the `seoditly` wordmark in the site font. The
 * wordmark stays real DOM text (not SVG paths) so it renders crisp at every
 * size and inherits the page's font. `size` scales the mark; the wordmark
 * tracks it via the text classes the caller passes through `className`.
 */
export function Logo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      {showWordmark && (
        <span className="text-base font-semibold tracking-tight text-foreground">
          {PRODUCT_NAME}
        </span>
      )}
    </span>
  );
}
