"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Expand } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { SmartImage } from "@/components/storefront/smart-image"
import { cn } from "@/lib/utils"

export function ProductGallery({ images, name }: { images: { id: string; url: string }[]; name: string }) {
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const count = images.length
  const current = images[index]
  const step = (delta: number) => setIndex((i) => (i + delta + count) % count)

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:gap-4">
      <div className="group relative aspect-square flex-1 overflow-hidden rounded-lg bg-secondary">
        <SmartImage
          src={current?.url}
          alt={count > 1 ? `${name} — photo ${index + 1} of ${count}` : name}
          sizes="(min-width: 1024px) 55vw, 100vw"
          priority
          fallbackLabel="No photo yet"
        />
        {current && (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-opacity hover:bg-background sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            aria-label="Enlarge photo"
          >
            <Expand className="h-4 w-4" />
          </button>
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur-sm hover:bg-background sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur-sm hover:bg-background sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto scrollbar-none lg:w-20 lg:flex-col lg:overflow-visible" aria-label="Product photos">
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "relative block h-16 w-16 overflow-hidden rounded-md bg-secondary ring-offset-2 ring-offset-background transition lg:h-20 lg:w-20",
                  i === index ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                )}
              >
                <SmartImage src={img.url} alt="" sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent
          className="max-w-[min(92vw,1100px)] border-0 bg-background p-2 sm:max-w-[min(92vw,1100px)]"
          onKeyDown={(e) => {
            if (count < 2) return
            if (e.key === "ArrowRight") step(1)
            if (e.key === "ArrowLeft") step(-1)
          }}
        >
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <DialogDescription className="sr-only">
            Photo {index + 1} of {count}. Use the arrow keys to move between photos.
          </DialogDescription>
          <div className="relative aspect-square max-h-[85vh] w-full overflow-hidden rounded-md bg-secondary sm:aspect-[4/3]">
            <SmartImage src={current?.url} alt={name} sizes="92vw" className="object-contain" />
          </div>
          {count > 1 && (
            <div className="flex items-center justify-between px-2 pb-1 pt-2 text-sm">
              <button type="button" onClick={() => step(-1)} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary">
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-muted-foreground tabular-nums">
                {index + 1} / {count}
              </span>
              <button type="button" onClick={() => step(1)} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-secondary">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
