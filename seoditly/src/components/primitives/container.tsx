import { cn } from "@/lib/utils";

interface ContainerProps extends React.ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
}

/** Centered content column — the horizontal rhythm for every page. */
export function Container({ children, className, ...props }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props}>
      {children}
    </div>
  );
}
