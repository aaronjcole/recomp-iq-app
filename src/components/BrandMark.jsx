import { cn } from "@/lib/utils";

/**
 * @param {{className?: string, alt?: string}} props
 */
export default function BrandMark({ className, alt = "" }) {
  return (
    <img
      src="/icons/recompone-192.png"
      alt={alt}
      width="192"
      height="192"
      decoding="async"
      className={cn("shrink-0 object-cover", className)}
    />
  );
}
