import { cn } from "@/lib/utils"

type Tone = "good" | "warning" | "critical" | "info" | "progress" | "neutral" | "muted"

const toneClass: Record<Tone, string> = {
  good: "bg-good/10 text-good",
  warning: "bg-warning/10 text-warning",
  critical: "bg-critical/10 text-critical",
  info: "bg-info/10 text-info",
  progress: "bg-viz-2/10 text-viz-2",
  neutral: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-muted-foreground",
}

/** Label + dot, so status never depends on colour alone. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}

const ORDER: Record<string, [Tone, string]> = {
  PENDING: ["muted", "Pending"],
  PAID: ["info", "Paid"],
  PROCESSING: ["warning", "To fulfil"],
  SHIPPED: ["progress", "Shipped"],
  COMPLETED: ["good", "Completed"],
  CANCELLED: ["muted", "Cancelled"],
  REFUNDED: ["critical", "Refunded"],
}

export function OrderStatusBadge({ status }: { status: string }) {
  const [tone, label] = ORDER[status] ?? ["neutral", status]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

const PAYOUT: Record<string, [Tone, string]> = {
  pending: ["muted", "Pending"],
  available: ["good", "Available"],
  in_payout: ["info", "In payout"],
  paid_out: ["neutral", "Paid out"],
  refunded: ["critical", "Refunded"],
  void: ["muted", "Not payable"],
}

export function PayoutStateBadge({ state }: { state: string }) {
  const [tone, label] = PAYOUT[state] ?? ["neutral", state]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

const STOCK: Record<string, [Tone, string]> = {
  in_stock: ["good", "In stock"],
  low: ["warning", "Low stock"],
  out: ["critical", "Out of stock"],
  inactive: ["muted", "Inactive"],
}

export function StockBadge({ state }: { state: string }) {
  const [tone, label] = STOCK[state] ?? ["neutral", state]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

const GENERIC: Record<string, [Tone, string]> = {
  active: ["good", "Active"],
  scheduled: ["info", "Scheduled"],
  expired: ["muted", "Expired"],
  cancelled: ["critical", "Deactivated"],
  approved: ["good", "Approved"],
  pending: ["warning", "Pending review"],
  suspended: ["critical", "Suspended"],
  ready: ["good", "Connected"],
  incomplete: ["warning", "Incomplete"],
  none: ["muted", "Not connected"],
  COMPLETED: ["good", "Completed"],
  PENDING: ["warning", "Pending"],
  FAILED: ["critical", "Failed"],
}

export function StateBadge({ state }: { state: string }) {
  const [tone, label] = GENERIC[state] ?? ["neutral", state]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}
