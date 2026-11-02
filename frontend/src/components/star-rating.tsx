"use client"

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

export function StarRating({
  value,
  onChange,
  size = "sm",
}: {
  value: number
  onChange?: (rating: number) => void
  size?: "sm" | "lg"
}) {
  const dim = size === "lg" ? "h-6 w-6" : "h-4 w-4"
  const interactive = !!onChange

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(star)}
          className={cn(!interactive && "cursor-default", interactive && "cursor-pointer")}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              dim,
              star <= Math.round(value)
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  )
}
