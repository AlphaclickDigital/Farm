"use client"

import { useState } from "react"
import Image from "next/image"
import { Sprout } from "lucide-react"
import { cn } from "@/lib/utils"

type Loader = (args: { src: string; width: number }) => string

/**
 * Product and farm photos already live on image CDNs that resize and pick
 * the format themselves, so srcset widths are requested from the CDN
 * directly instead of being re-fetched through the Next.js optimiser.
 * Local images (/images/...) use the built-in optimiser; any other host is
 * served as-is.
 */
function cdnLoader(src: string): Loader | "local" | null {
  if (src.startsWith("/")) return "local"
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return null
  }
  switch (url.hostname) {
    case "images.pexels.com":
    case "images.unsplash.com":
      return ({ width }) => {
        const sized = new URL(src)
        sized.searchParams.set("w", String(width))
        if (url.hostname === "images.unsplash.com") sized.searchParams.set("auto", "format")
        else sized.searchParams.set("auto", "compress")
        return sized.toString()
      }
    case "res.cloudinary.com":
      return src.includes("/upload/")
        ? ({ width }) => src.replace("/upload/", `/upload/w_${width},c_limit,q_auto,f_auto/`)
        : null
    default:
      return null
  }
}

interface SmartImageProps {
  src: string | null | undefined
  alt: string
  sizes: string
  className?: string
  priority?: boolean
  /** Shown when there is no image or it fails to load. */
  fallbackLabel?: string
}

/**
 * Fills its (relative, sized) parent, whose background acts as the loading
 * placeholder, and degrades to a quiet placeholder for missing/broken images.
 */
export function SmartImage({ src, alt, sizes, className, priority, fallbackLabel }: SmartImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-secondary text-muted-foreground/60"
      >
        <Sprout className="h-8 w-8" strokeWidth={1.25} />
        {fallbackLabel && <span className="px-4 text-center text-xs">{fallbackLabel}</span>}
      </div>
    )
  }

  const loader = cdnLoader(src)
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      loader={typeof loader === "function" ? loader : undefined}
      unoptimized={loader === null}
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  )
}
