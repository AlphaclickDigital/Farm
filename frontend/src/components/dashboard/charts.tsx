"use client"

import { useId } from "react"
import Link from "next/link"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatBucket, formatCents, formatCompactCents, formatNumber } from "@/lib/format"

export type ValueFormat = "currency" | "number" | "percent"

// Categorical slots in fixed order (validated for CVD separation). Assign by
// entity, never by rank, and never beyond five — fold the rest into "Other".
export const SERIES_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"]
export const COMPARE_COLOR = "var(--viz-compare)"

export function formatValue(value: number, format: ValueFormat, compact = false) {
  if (format === "currency") return compact ? formatCompactCents(value) : formatCents(value)
  if (format === "percent") return `${value.toFixed(1)}%`
  return formatNumber(value)
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 }

interface TooltipRow {
  label: string
  value: string
  color: string
  muted?: boolean
}

function TooltipCard({ title, rows, footer }: { title: string; rows: TooltipRow[]; footer?: React.ReactNode }) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} aria-hidden />
            <span className={cn("flex-1", row.muted ? "text-muted-foreground" : "text-foreground")}>{row.label}</span>
            <span className={cn("font-medium tabular-nums", row.muted ? "text-muted-foreground" : "text-foreground")}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t pt-1.5 text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

// Minimal shape of what Recharts passes to a custom tooltip.
interface RechartsTooltipProps {
  active?: boolean
  payload?: Array<{ payload: Record<string, unknown> }>
}

// ───── Trend (current vs previous period) ─────

export interface TrendPoint {
  bucket: string
  current: number
  previous?: number
  prevBucket?: string | null
}

export function TrendChart({
  data,
  granularity,
  format = "currency",
  currentLabel,
  previousLabel = "Previous period",
  showPrevious = true,
  height = 280,
}: {
  data: TrendPoint[]
  granularity: string
  format?: ValueFormat
  currentLabel: string
  previousLabel?: string
  showPrevious?: boolean
  height?: number
}) {
  const gradientId = useId().replace(/:/g, "")
  const hasPrevious = showPrevious && data.some((d) => (d.previous ?? 0) > 0)

  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: currentLabel, color: SERIES_COLORS[0] },
          ...(hasPrevious ? [{ label: previousLabel, color: COMPARE_COLOR }] : []),
        ]}
      />
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(b: string) => formatBucket(b, granularity)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => formatValue(v, format, true)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              content={(props) => {
                const { active, payload } = props as unknown as RechartsTooltipProps
                if (!active || !payload?.length) return null
                const point = payload[0].payload as unknown as TrendPoint
                const change =
                  point.previous && point.previous > 0
                    ? ((point.current - point.previous) / point.previous) * 100
                    : null
                return (
                  <TooltipCard
                    title={formatBucket(point.bucket, granularity, "long")}
                    rows={[
                      { label: currentLabel, value: formatValue(point.current, format), color: SERIES_COLORS[0] },
                      ...(hasPrevious
                        ? [
                            {
                              label: point.prevBucket ? formatBucket(point.prevBucket, granularity, "long") : previousLabel,
                              value: formatValue(point.previous ?? 0, format),
                              color: COMPARE_COLOR,
                              muted: true,
                            },
                          ]
                        : []),
                    ]}
                    footer={change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous` : undefined}
                  />
                )
              }}
            />
            {hasPrevious && (
              <Line
                type="monotone"
                dataKey="previous"
                stroke={COMPARE_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            )}
            <Area
              type="monotone"
              dataKey="current"
              stroke="var(--viz-1)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <SeriesTable
        caption={currentLabel}
        rows={data.map((d) => [
          formatBucket(d.bucket, granularity, "long"),
          formatValue(d.current, format),
          ...(hasPrevious ? [formatValue(d.previous ?? 0, format)] : []),
        ])}
        headers={["Period", currentLabel, ...(hasPrevious ? [previousLabel] : [])]}
      />
    </div>
  )
}

/** Screen-reader table equivalent of a chart. */
function SeriesTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ───── Columns (counts over time, stacked sources, monthly comparison) ─────

export function ColumnChart({
  data,
  series,
  xKey = "bucket",
  granularity = "day",
  xFormatter,
  format = "currency",
  stacked = false,
  height = 260,
}: {
  data: Record<string, number | string | null>[]
  series: { key: string; label: string; color?: string }[]
  xKey?: string
  granularity?: string
  xFormatter?: (value: string) => string
  format?: ValueFormat
  stacked?: boolean
  height?: number
}) {
  const formatX = xFormatter ?? ((value: string) => formatBucket(value, granularity))
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES_COLORS[i] }))
  return (
    <div className="space-y-3">
      {colored.length > 1 && <ChartLegend items={colored} />}
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey={xKey}
              tickFormatter={(v: string) => formatX(String(v))}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
              dy={6}
            />
            <YAxis
              tickFormatter={(v: number) => formatValue(v, format, true)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={56}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={(props) => {
                const { active, payload } = props as unknown as RechartsTooltipProps
                if (!active || !payload?.length) return null
                const row = payload[0].payload
                const total = colored.reduce((s, c) => s + Number(row[c.key] ?? 0), 0)
                return (
                  <TooltipCard
                    title={xFormatter ? formatX(String(row[xKey])) : formatBucket(String(row[xKey]), granularity, "long")}
                    rows={colored.map((c) => ({
                      label: c.label,
                      value: formatValue(Number(row[c.key] ?? 0), format),
                      color: c.color,
                    }))}
                    footer={stacked && colored.length > 1 ? `Total ${formatValue(total, format)}` : undefined}
                  />
                )
              }}
            />
            {colored.map((c, i) => (
              <Bar
                key={c.key}
                dataKey={c.key}
                name={c.label}
                fill={c.color}
                stackId={stacked ? "stack" : undefined}
                radius={!stacked || i === colored.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SeriesTable
        caption={colored.map((c) => c.label).join(", ")}
        headers={["Period", ...colored.map((c) => c.label)]}
        rows={data.map((row) => [formatX(String(row[xKey])), ...colored.map((c) => formatValue(Number(row[c.key] ?? 0), format))])}
      />
    </div>
  )
}

// ───── Ranked bars (HTML, fully labelled) ─────

export interface BarListItem {
  key: string
  label: React.ReactNode
  value: number
  sub?: React.ReactNode
  href?: string
}

export function BarList({
  items,
  format = "currency",
  valueLabel,
  className,
}: {
  items: BarListItem[]
  format?: ValueFormat
  valueLabel?: (item: BarListItem) => React.ReactNode
  className?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 0)
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => {
        const pct = max > 0 ? Math.max(2, (item.value / max) * 100) : 0
        const label = (
          <span className="truncate text-sm text-foreground">{item.label}</span>
        )
        return (
          <li key={item.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                {item.href ? (
                  <Link href={item.href} className="min-w-0 truncate hover:underline">
                    {label}
                  </Link>
                ) : (
                  label
                )}
                {item.sub && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{item.sub}</span>}
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {valueLabel ? valueLabel(item) : formatValue(item.value, format)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-viz-1" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ───── Part-to-whole ─────

export interface Segment {
  key: string
  label: string
  value: number
  /** Folded "Other" bucket — drawn in the neutral comparison colour. */
  other?: boolean
}

export function SegmentedBar({ segments, format = "currency" }: { segments: Segment[]; format?: ValueFormat }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  let colorIndex = 0
  const colored = segments.map((s) => ({
    ...s,
    color: s.other ? COMPARE_COLOR : SERIES_COLORS[colorIndex++ % SERIES_COLORS.length],
    share: total > 0 ? (s.value / total) * 100 : 0,
  }))
  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {colored
          .filter((s) => s.share > 0)
          .map((s) => (
            <div key={s.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${s.share}%`, background: s.color }} title={`${s.label}: ${s.share.toFixed(1)}%`} />
          ))}
      </div>
      <ul className="space-y-2">
        {colored.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-sm">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.share.toFixed(1)}%</span>
            <span className="w-24 text-right font-medium tabular-nums text-foreground">{formatValue(s.value, format)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
