import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CTAButtonProps {
  href: string;
  /** `primary` = filled violet, `secondary` = outline. */
  variant?: "primary" | "secondary";
  children: React.ReactNode;
  className?: string;
}

/**
 * Marketing call-to-action: a Next {@link Link} styled as a shadcn Button,
 * sized up for hero/section use with a strong violet focus ring.
 */
export function CTAButton({
  href,
  variant = "primary",
  children,
  className,
}: CTAButtonProps) {
  return (
    <Button
      asChild
      variant={variant === "primary" ? "default" : "outline"}
      className={cn("h-11 rounded-lg px-5 text-sm font-medium", className)}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}
