import { cn } from "@/lib/utils"

const STAR_PATH =
  "M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9L10 1.5z"

/** Read-only star row with fractional fill. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-px", className)} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i))
        return (
          <svg key={i} viewBox="0 0 20 20" className="h-[1em] w-[1em]">
            <path d={STAR_PATH} className="fill-border" />
            {fill > 0 && (
              <path
                d={STAR_PATH}
                className="fill-gold"
                style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }}
              />
            )}
          </svg>
        )
      })}
    </span>
  )
}

/** "★★★★☆ 4.6 (12)" — renders nothing when there are no reviews. */
export function RatingSummary({
  average,
  count,
  className,
  showCount = true,
}: {
  average: number
  count: number
  className?: string
  showCount?: boolean
}) {
  if (!count) return null
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ${count === 1 ? "review" : "reviews"}`}
    >
      <Stars value={average} className="text-[13px]" />
      <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
      {showCount && <span>({count})</span>}
    </span>
  )
}
