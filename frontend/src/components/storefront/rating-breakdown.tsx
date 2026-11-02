import { cn } from "@/lib/utils"

/** Five horizontal bars showing how ratings split between 5★ and 1★. */
export function RatingBreakdown({
  distribution,
  total,
  className,
}: {
  distribution: Record<string | number, number>
  total: number
  className?: string
}) {
  return (
    <dl className={cn("space-y-1.5", className)}>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[star] ?? 0
        const pct = total ? Math.round((n / total) * 100) : 0
        return (
          <div key={star} className="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-3 text-xs">
            <dt className="tabular-nums text-muted-foreground">{star} star</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-secondary" aria-label={`${pct}% of reviews`}>
              <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </dd>
            <dd className="text-right tabular-nums text-muted-foreground">{n}</dd>
          </div>
        )
      })}
    </dl>
  )
}
