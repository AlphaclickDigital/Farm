"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, CircleDollarSign, Clock, Landmark, PiggyBank, Receipt, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qs, useApi } from "@/lib/api"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateTime, formatPercent, shortId } from "@/lib/format"
import type { LedgerRow, Paged, VendorFinance } from "@/lib/dashboard-types"
import { useRangeParams } from "@/store/use-dashboard-range"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { TrendChart } from "@/components/dashboard/charts"
import { StateBadge, StatusBadge } from "@/components/dashboard/status-badge"
import {
  DeltaBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Pagination,
  QueryBoundary,
  SectionCard,
  SegmentedControl,
  StatTile,
} from "@/components/dashboard/primitives"

const TYPE_LABEL = { SALE: "Sale", REFUND: "Refund", PAYOUT: "Payout" } as const
const PAGE_SIZE = 15

export default function EarningsPage() {
  const finance = useAnalytics<VendorFinance>("/analytics/vendor/finance")
  const [type, setType] = useState<"all" | "sale" | "refund" | "payout">("all")
  const [page, setPage] = useState(1)
  const range = useRangeParams()
  const ledger = useApi<Paged<LedgerRow>>(`/analytics/vendor/transactions${qs({ ...range, type, page, pageSize: PAGE_SIZE })}`)
  const f = finance.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="How your sales turn into payouts. Earnings are counted when an order is placed and become available once it's completed."
        actions={
          <>
            <ExportButton path="/analytics/vendor/export/earnings" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      {/* Balances (point in time) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {f ? (
          <>
            <StatTile label="Available to pay out" value={formatCents(f.balances.available)} sub={`Minimum payout ${formatCents(f.balances.minPayoutCents)}`} icon={Wallet} tone="good" href="/vendor/dashboard/payouts" />
            <StatTile label="Pending" value={formatCents(f.balances.pending)} sub="Orders not yet completed" icon={Clock} tone="warning" />
            <StatTile label="In payout" value={formatCents(f.balances.inPayout)} sub={f.balances.payoutsOpen ? `${f.balances.payoutsOpen} transfer in progress` : "Nothing in progress"} icon={Landmark} tone="info" />
            <StatTile label="Paid out to date" value={formatCents(f.balances.paidOut)} sub={`${f.balances.payoutsCompleted} payouts`} icon={PiggyBank} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        )}
      </div>

      {f && !f.stripe.payoutsEnabled && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium">{f.stripe.connected ? "Finish your Stripe setup" : "Connect Stripe to receive payouts"}</p>
            <p className="text-muted-foreground">Your earnings keep accruing, but they can only be transferred to a verified Stripe account.</p>
          </div>
          <Button asChild size="sm">
            <Link href="/vendor/dashboard/payouts">
              Set up payouts <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Breakdown" description="Orders placed in this period">
          <QueryBoundary query={finance} skeleton={<LoadingBlock className="h-64" />}>
            {(data) => {
              const b = data.breakdown
              const row = (label: string, value: number, change: number | null, opts?: { negative?: boolean; strong?: boolean; invert?: boolean; hint?: string }) => (
                <div className={opts?.strong ? "flex items-center justify-between gap-3 border-t pt-3" : "flex items-center justify-between gap-3"}>
                  <div className="min-w-0">
                    <p className={opts?.strong ? "text-sm font-semibold" : "text-sm"}>{label}</p>
                    {opts?.hint && <p className="text-[11px] text-muted-foreground">{opts.hint}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <DeltaBadge change={change} invert={opts?.invert} hasValue={value > 0} />
                    <span className={`w-24 text-right tabular-nums ${opts?.strong ? "text-base font-semibold" : "font-medium"}`}>
                      {opts?.negative && value > 0 ? "−" : ""}
                      {formatCents(value)}
                    </span>
                  </div>
                </div>
              )
              return (
                <div className="space-y-3">
                  {row("Gross sales", b.grossSales.value, b.grossSales.change)}
                  {row("Marketplace commission", b.commission.value, b.commission.change, {
                    negative: true,
                    invert: true,
                    hint: `${formatPercent(b.effectiveCommissionRate)} of gross sales`,
                  })}
                  {row("Shipping charged", b.shipping.value, b.shipping.change, { hint: "Passed through to you in full" })}
                  {row("Net earnings", b.netEarnings.value, b.netEarnings.change, { strong: true })}
                  <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">{formatCents(b.refunds.value)}</span> refunded to customers on {b.refunds.count} order
                      {b.refunds.count === 1 ? "" : "s"} this period (not included above).
                    </p>
                    <p>Card processing fees are paid by the marketplace and never deducted from your earnings.</p>
                  </div>
                </div>
              )
            }}
          </QueryBoundary>
        </SectionCard>

        <SectionCard className="xl:col-span-2" title="Earnings history" description="Net earnings by order date">
          <QueryBoundary query={finance} skeleton={<LoadingBlock className="h-72" />}>
            {(data) =>
              data.series.every((p) => p.earnings === 0 && p.prevEarnings === 0) ? (
                <EmptyState icon={CircleDollarSign} title="No earnings in this period" />
              ) : (
                <TrendChart
                  granularity={data.range.granularity}
                  currentLabel="Net earnings"
                  data={data.series.map((p) => ({ bucket: p.bucket, current: p.earnings, previous: p.prevEarnings }))}
                />
              )
            }
          </QueryBoundary>
        </SectionCard>
      </div>

      <SectionCard
        title="Transactions"
        description="Sales, refunds and Stripe transfers in this period"
        action={
          <SegmentedControl
            size="xs"
            ariaLabel="Transaction type"
            value={type}
            onChange={(value) => {
              setType(value)
              setPage(1)
            }}
            options={[
              { value: "all", label: "All" },
              { value: "sale", label: "Sales" },
              { value: "refund", label: "Refunds" },
              { value: "payout", label: "Payouts" },
            ]}
          />
        }
        contentClassName="p-0 pt-2"
      >
        {ledger.error && !ledger.data ? (
          <ErrorState message={ledger.error.message} onRetry={() => ledger.refetch()} />
        ) : !ledger.data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : ledger.data.data.length === 0 ? (
          <EmptyState icon={Receipt} title="No transactions in this period" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Gross</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Commission</TableHead>
                  <TableHead className="pr-5 text-right">Net to you</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={ledger.isFetching ? "opacity-60" : undefined}>
                {ledger.data.data.map((t) => (
                  <TableRow key={`${t.type}-${t.id}`}>
                    <TableCell className="whitespace-nowrap pl-5 text-sm text-muted-foreground">{formatDateTime(t.date)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={t.type === "SALE" ? "good" : t.type === "REFUND" ? "critical" : "info"}>{TYPE_LABEL[t.type]}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.type === "PAYOUT" ? (
                        <span className="flex items-center gap-2">
                          Transfer to Stripe <StateBadge state={t.status} />
                        </span>
                      ) : (
                        <Link href={`/vendor/dashboard/orders/${t.id}`} className="hover:underline">
                          {shortId(t.id)} · {t.counterparty ?? "Customer"}
                          {t.type === "SALE" && !["PAID", "PROCESSING", "SHIPPED", "COMPLETED"].includes(t.status) && (
                            <span className="ml-1 text-xs text-muted-foreground">({t.status.toLowerCase()})</span>
                          )}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{t.gross ? formatCents(t.gross) : "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{t.commission ? `−${formatCents(t.commission)}` : "—"}</TableCell>
                    <TableCell className="pr-5 text-right font-medium tabular-nums">{t.net ? formatCents(t.net) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-5 pb-5">
          {ledger.data && <Pagination page={page} pageSize={PAGE_SIZE} total={ledger.data.total} loading={ledger.isFetching} onPageChange={setPage} />}
        </div>
      </SectionCard>
    </div>
  )
}
