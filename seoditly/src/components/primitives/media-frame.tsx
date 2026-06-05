import Image from "next/image";

import { cn } from "@/lib/utils";

interface MediaFrameProps {
  /** Asset path under `public/`, e.g. "/media/dashboard.png". Omit for a placeholder. */
  src?: string;
  type?: "image" | "video";
  /** Alt text (images) / accessible label (videos / placeholder). */
  alt: string;
  className?: string;
}

/**
 * A 16:9 media surface with a violet ring.
 *
 * Placeholder-first: when `src` is missing it renders a correctly-sized
 * `aspect-video` block so pages are presentable before assets exist. Dropping
 * a real asset into `public/media/` and passing `src` swaps it in with zero
 * layout shift — same box, same ring.
 */
export function MediaFrame({
  src,
  type = "image",
  alt,
  className,
}: MediaFrameProps) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl border border-primary/40 bg-card ring-1 ring-primary/20",
        className,
      )}
    >
      {src ? (
        type === "video" ? (
          <video
            className="size-full object-cover"
            src={src}
            autoPlay
            muted
            loop
            playsInline
            aria-label={alt}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 1024px"
            className="object-cover"
          />
        )
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_center,hsl(265_85%_65%/0.10),transparent_70%)]"
        >
          <span className="text-sm font-medium tracking-wide text-muted-foreground">
            {alt}
          </span>
        </div>
      )}
    </div>
  );
}
