"use client"

import Link from "next/link"
import { Info, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { useCompareLabel } from "@/store/use-dashboard-range"
import { DeltaBadge } from "./primitives"

/** Minimal trend line for KPI cards. Decorative: the number carries the meaning. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const width = 100
  const height = 28
  const max = Math.max(...values)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - ((v - min) / span) * (height - 4),
  ])
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-7 w-full", className)} aria-hidden>
      <path d={`${line} L${width},${height} L0,${height} Z`} className="fill-viz-1/10" />
      <path d={line} className="fill-none stroke-viz-1" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function KpiCard({
  label,
  value,
  change,
  invert,
  icon: Icon,
  spark,
  hint,
  footnote,
  loading,
  href,
}: {
  label: string
  value: React.ReactNode
  change?: number | null
  invert?: boolean
  icon: LucideIcon
  spark?: number[]
  /** Definition shown on hover/focus of the info icon. */
  hint?: string
  /** Replaces the "vs previous period" line, e.g. for point-in-time totals. */
  footnote?: React.ReactNode
  loading?: boolean
  href?: string
}) {
  const compare = useCompareLabel()
  const body = loading ? (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-7 w-full" />
    </div>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {label}
          {hint && (
            <span tabIndex={0} title={hint} aria-label={hint} className="cursor-help rounded text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Info className="size-3" />
            </span>
          )}
        </p>
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/8 text-primary">
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {footnote ?? (
          <>
            <DeltaBadge change={change} invert={invert} />
            <span>vs {compare}</span>
          </>
        )}
      </div>
      {spark && <Sparkline values={spark} className="mt-3" />}
    </>
  )
  const className = "flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-xs transition-colors"
  return href && !loading ? (
    <Link href={href} className={cn(className, "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
