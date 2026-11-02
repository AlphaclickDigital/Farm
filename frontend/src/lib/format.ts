export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100)
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ───── Dashboard formatting (en-AU, AUD) ─────

const compactCurrency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  notation: "compact",
  maximumFractionDigits: 1,
})
const wholeCurrency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat("en-AU")

/** $1.2K / $34K — for chart axes and tight spaces. */
export function formatCompactCents(cents: number): string {
  return Math.abs(cents) < 100_000 ? wholeCurrency.format(cents / 100) : compactCurrency.format(cents / 100)
}

export function formatWholeCents(cents: number): string {
  return wholeCurrency.format(cents / 100)
}

export function formatNumber(value: number): string {
  return integer.format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value.toFixed(digits)}%`
}

const REPORTING_TZ = "Australia/Sydney"

/**
 * Chart bucket keys come from the API already in the reporting timezone
 * ("2026-10-31" or "2026-10-31 14:00"), so they are formatted as plain
 * calendar values without any timezone conversion.
 */
export function formatBucket(bucket: string, granularity: string, style: "short" | "long" = "short"): string {
  const [datePart, timePart] = bucket.split(" ")
  const [y, m, d] = datePart.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC" }
  if (granularity === "hour") {
    const hour = Number(timePart?.slice(0, 2) ?? 0)
    const label = `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`
    return style === "long"
      ? `${date.toLocaleDateString("en-AU", { ...opts, day: "numeric", month: "short" })}, ${label}`
      : label
  }
  if (granularity === "month") {
    return date.toLocaleDateString("en-AU", { ...opts, month: "short", ...(style === "long" && { year: "numeric" }) })
  }
  const base = date.toLocaleDateString("en-AU", { ...opts, day: "numeric", month: "short" })
  return granularity === "week" && style === "long" ? `Week of ${base}` : base
}

export function formatDateShort(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: REPORTING_TZ })
}

export function formatRelative(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDateShort(date)
}

/** 1500 gram → "1.5 kg"; 12 piece → "12 pcs". Mirrors the backend helper. */
export function formatBaseUnits(amount: number, baseUnit: string): string {
  if (baseUnit === "gram") return amount >= 1000 ? `${+(amount / 1000).toFixed(2)} kg` : `${amount} g`
  if (baseUnit === "ml") return amount >= 1000 ? `${+(amount / 1000).toFixed(2)} L` : `${amount} ml`
  return `${amount} ${amount === 1 ? "pc" : "pcs"}`
}

export function shortId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`
}

/** Infer a series' grain from its bucket keys ("YYYY-MM-DD HH:00" is hourly). */
export function guessGranularity(buckets: string[]): "hour" | "day" | "week" | "month" {
  if (buckets[0]?.includes(" ")) return "hour"
  if (buckets.length < 2) return "day"
  const gap = (Date.parse(buckets[1]) - Date.parse(buckets[0])) / 86_400_000
  return gap >= 28 ? "month" : gap >= 7 ? "week" : "day"
}
