"use client"

import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, RefreshCw, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"

// ───── Page + section layout ─────

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  id,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  id?: string
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-20 rounded-xl border bg-card text-card-foreground shadow-xs", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  )
}

// ───── States ─────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="text-sm font-medium text-foreground">Couldn&apos;t load this section</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message || "Something went wrong. Please try again."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  )
}

export function LoadingBlock({ className }: { className?: string }) {
  return <Skeleton className={cn("h-64 w-full rounded-lg", className)} />
}

/** Renders loading / error / content consistently for a query-backed section. */
export function QueryBoundary<T>({
  query,
  skeleton,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; error: { message: string } | null; refetch: () => unknown }
  skeleton?: React.ReactNode
  children: (data: T) => React.ReactNode
}) {
  if (query.error && !query.data) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
  if (!query.data) return <>{skeleton ?? <LoadingBlock />}</>
  return <>{children(query.data)}</>
}

// ───── Change indicators ─────

/**
 * Period-over-period change with an arrow and a sign, so direction never
 * relies on colour alone. `invert` flips good/bad for metrics where a rise is
 * bad (refunds, cancellations).
 */
export function DeltaBadge({
  change,
  invert = false,
  hasValue = true,
  className,
}: {
  change: number | null | undefined
  invert?: boolean
  hasValue?: boolean
  className?: string
}) {
  // Nothing in either period: a "0%" badge would just be noise.
  if (!hasValue && !change) {
    return <span className={cn("text-[11px] text-muted-foreground", className)}>—</span>
  }
  if (change === null || change === undefined) {
    return hasValue ? (
      <span className={cn("inline-flex items-center rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] font-semibold text-info", className)}>
        New
      </span>
    ) : (
      <span className={cn("text-[11px] text-muted-foreground", className)}>—</span>
    )
  }
  const flat = Math.abs(change) < 0.5
  const up = change > 0
  const good = invert ? !up : up
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        flat ? "bg-muted text-muted-foreground" : good ? "bg-good/10 text-good" : "bg-critical/10 text-critical",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span>
        {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(change) >= 100 ? Math.round(Math.abs(change)) : Math.abs(change).toFixed(1)}%`}
      </span>
    </span>
  )
}

// ───── Small stat + meter ─────

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: LucideIcon
  tone?: "default" | "good" | "warning" | "critical" | "info"
  href?: string
}) {
  const toneClass = {
    default: "text-muted-foreground bg-muted",
    good: "text-good bg-good/10",
    warning: "text-warning bg-warning/10",
    critical: "text-critical bg-critical/10",
    info: "text-info bg-info/10",
  }[tone]
  const body = (
    <div className="flex items-start gap-3">
      {Icon && (
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">{value}</p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
  const className = "min-w-0 rounded-lg border bg-card p-3.5 transition-colors"
  return href ? (
    <Link href={href} className={cn(className, "hover:border-primary/40 hover:bg-accent/40")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

export function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className="h-full rounded-full bg-viz-1" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ───── Filters + pagination ─────

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode; count?: number }[]
  size?: "xs" | "sm"
  ariaLabel?: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border bg-muted/50 p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "xs" ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs sm:text-sm",
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {formatNumber(option.count)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  loading,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  loading?: boolean
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-muted-foreground">
      <span aria-live="polite">
        Showing <span className="font-medium text-foreground">{formatNumber(start)}–{formatNumber(end)}</span> of{" "}
        <span className="font-medium text-foreground">{formatNumber(total)}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular-nums">
          Page {page} of {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
