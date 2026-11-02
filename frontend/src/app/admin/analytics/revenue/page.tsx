"use client"

import { useState } from "react"
import {
  AlertOctagon,
  ArrowDownLeft,
  ArrowUpRight,
  BadgePercent,
  CircleDollarSign,
  CreditCard,
  Megaphone,
  Receipt,
  Search,
  ShoppingBag,
  Undo2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qs, useApi } from "@/lib/api"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateTime, formatNumber, formatPercent } from "@/lib/format"
import type { FinanceReport, Paged, RevenueReport, TransactionRow } from "@/lib/dashboard-types"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useRangeParams } from "@/store/use-dashboard-range"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ColumnChart, TrendChart } from "@/components/dashboard/charts"
import { StatusBadge } from "@/components/dashboard/status-badge"
import {
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

type Metric = "gmv" | "platformRevenue" | "orders"
type TxnType = "all" | "charge" | "refund" | "payout" | "promotion" | "incident"

const TXN_TONE = {
  CHARGE: ["good", "Customer charge"],
  REFUND: ["critical", "Refund"],
  PAYOUT: ["info", "Vendor payout"],
  PROMOTION: ["progress", "Listing fee"],
  INCIDENT: ["warning", "Payment issue"],
} as const

const PAGE_SIZE = 20

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" })
}

export default function RevenuePage() {
  const revenue = useAnalytics<RevenueReport>("/analytics/admin/revenue")
  const finance = useAnalytics<FinanceReport>("/analytics/admin/finance")
  const [metric, setMetric] = useState<Metric>("gmv")
  const [monthly, setMonthly] = useState<"platformRevenue" | "gmv">("platformRevenue")
  const r = revenue.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue & finance"
        description="GMV is merchandise sold by farms (excluding shipping, cancelled and refunded orders). Platform revenue is the marketplace's share: commission plus featured-listing fees."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/revenue" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="GMV" icon={ShoppingBag} loading={!r} value={r && formatCents(r.gmv.value)} change={r?.gmv.change} />
        <KpiCard
          label="Platform revenue"
          icon={CircleDollarSign}
          loading={!r}
          value={r && formatCents(r.platformRevenue.value)}
          change={r?.platformRevenue.change}
          hint="Commission + featured-listing fees."
        />
        <KpiCard
          label="Take rate"
          icon={BadgePercent}
          loading={!r}
          value={r && formatPercent(r.takeRate.effective)}
          hint="Platform revenue ÷ GMV."
          footnote={r && <span>Commission {formatPercent(r.takeRate.commissionEffective)}{r.takeRate.configured !== null && ` (configured ${formatPercent(r.takeRate.configured, 0)})`}</span>}
        />
        <KpiCard label="Sales commission" icon={Receipt} loading={!r} value={r && formatCents(r.commission.value)} change={r?.commission.change} />
        <KpiCard
          label="Featured-listing revenue"
          icon={Megaphone}
          loading={!r}
          value={r && formatCents(r.promotionRevenue.value)}
          change={r?.promotionRevenue.change}
          footnote={r && <span>{formatNumber(r.promotionRevenue.count)} listings sold</span>}
        />
        <KpiCard
          label="Refunds"
          icon={Undo2}
          loading={!r}
          value={r && formatCents(r.refunds.value)}
          change={r?.refunds.change}
          invert
          hint="Merchandise + shipping refunded to customers, by refund date. Includes cancellations."
        />
      </div>

      <SectionCard
        title="Revenue over time"
        description="Compared with the previous period"
        action={
          <SegmentedControl<Metric>
            size="xs"
            ariaLabel="Metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "gmv", label: "GMV" },
              { value: "platformRevenue", label: "Platform revenue" },
              { value: "orders", label: "Orders" },
            ]}
          />
        }
      >
        <QueryBoundary query={revenue} skeleton={<LoadingBlock className="h-80" />}>
          {(data) => (
            <TrendChart
              height={300}
              granularity={data.range.granularity}
              format={metric === "orders" ? "number" : "currency"}
              currentLabel={metric === "gmv" ? "GMV" : metric === "orders" ? "Orders" : "Platform revenue"}
              data={data.series.map((p) => ({
                bucket: p.bucket,
                current: metric === "gmv" ? p.gmv : metric === "orders" ? p.orders : p.platformRevenue,
                previous: metric === "gmv" ? p.prevGmv : metric === "orders" ? p.prevOrders : p.prevPlatformRevenue,
              }))}
            />
          )}
        </QueryBoundary>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Platform revenue by source" description="Commission and listing fees per period">
          <QueryBoundary query={revenue} skeleton={<LoadingBlock className="h-64" />}>
            {(data) => (
              <ColumnChart
                stacked
                granularity={data.range.granularity}
                data={data.series}
                series={[
                  { key: "commission", label: "Sales commission" },
                  { key: "promotions", label: "Featured listings" },
                ]}
              />
            )}
          </QueryBoundary>
        </SectionCard>
        <SectionCard
          title="Monthly comparison"
          description="Last 12 calendar months"
          action={
            <SegmentedControl
              size="xs"
              ariaLabel="Monthly metric"
              value={monthly}
              onChange={setMonthly}
              options={[
                { value: "platformRevenue", label: "Revenue" },
                { value: "gmv", label: "GMV" },
              ]}
            />
          }
        >
          <QueryBoundary query={revenue} skeleton={<LoadingBlock className="h-64" />}>
            {(data) => (
              <ColumnChart
                xKey="month"
                xFormatter={monthLabel}
                data={data.monthly}
                series={[{ key: monthly, label: monthly === "gmv" ? "GMV" : "Platform revenue" }]}
              />
            )}
          </QueryBoundary>
        </SectionCard>
      </div>

      <SectionCard id="finance" title="Money flow" description="What moved through Stripe in this period, and what the marketplace still owes farms">
        <QueryBoundary query={finance} skeleton={<LoadingBlock className="h-48" />}>
          {(f) => (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Charged to customers" value={formatCents(f.stripe.chargedOrders)} sub={`${formatNumber(f.stripe.chargedOrdersCount)} orders incl. shipping`} icon={ArrowDownLeft} tone="good" />
                <StatTile label="Listing fees collected" value={formatCents(f.stripe.chargedPromotions)} icon={Megaphone} tone="good" />
                <StatTile label="Refunded" value={formatCents(f.stripe.refunded)} sub={`${formatNumber(f.refunds.count)} vendor orders`} icon={Undo2} tone={f.refunds.count ? "warning" : "default"} />
                <StatTile label="Transferred to farms" value={formatCents(f.stripe.transferredToVendors)} sub={`${formatNumber(f.stripe.transfersCount)} payouts`} icon={ArrowUpRight} tone="info" href="/admin/payouts" />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Owed: ready to pay out" value={formatCents(f.owedToVendors.available)} sub="Completed orders, not yet paid" icon={CreditCard} />
                <StatTile label="Owed: still in progress" value={formatCents(f.owedToVendors.pending)} sub="Open orders" icon={CreditCard} />
                <StatTile
                  label="Payouts pending / failed"
                  value={`${f.payouts.pendingCount} / ${f.payouts.failedCount}`}
                  sub={formatCents(f.payouts.pending + f.payouts.failed)}
                  icon={AlertOctagon}
                  tone={f.payouts.failedCount ? "critical" : f.payouts.pendingCount ? "warning" : "default"}
                  href="/admin/payouts"
                />
                <StatTile
                  label="Failed payments · disputes"
                  value={`${formatNumber(f.failedPayments.count)} · ${formatNumber(f.disputes.count)}`}
                  sub={f.disputes.open ? `${f.disputes.open} dispute${f.disputes.open === 1 ? "" : "s"} open` : "No open disputes"}
                  icon={AlertOctagon}
                  tone={f.disputes.open ? "critical" : f.failedPayments.count ? "warning" : "default"}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Stripe card fees are charged to the platform account and aren&apos;t imported, so net figures here are before
                processing fees. Failed payments and disputes are recorded from Stripe webhooks.
              </p>
            </div>
          )}
        </QueryBoundary>
      </SectionCard>

      <TransactionsCard />
    </div>
  )
}

function TransactionsCard() {
  const [type, setType] = useState<TxnType>("all")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search, 300)
  const range = useRangeParams()
  const txns = useApi<Paged<TransactionRow>>(`/analytics/admin/transactions${qs({ ...range, type, q, page, pageSize: PAGE_SIZE })}`)

  return (
    <SectionCard
      id="transactions"
      title="Transactions"
      description="Every recorded money movement in this period"
      contentClassName="p-0"
      action={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Stripe id, farm, customer…"
            className="h-8 pl-8 sm:w-56"
            aria-label="Search transactions"
          />
        </div>
      }
    >
      <div className="border-b px-5 pb-3 pt-1">
        <SegmentedControl<TxnType>
          size="xs"
          ariaLabel="Transaction type"
          value={type}
          onChange={(value) => {
            setType(value)
            setPage(1)
          }}
          options={[
            { value: "all", label: "All" },
            { value: "charge", label: "Charges" },
            { value: "refund", label: "Refunds" },
            { value: "payout", label: "Payouts" },
            { value: "promotion", label: "Listing fees" },
            { value: "incident", label: "Failed / disputed" },
          ]}
        />
      </div>
      {txns.error && !txns.data ? (
        <ErrorState message={txns.error.message} onRetry={() => txns.refetch()} />
      ) : !txns.data ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : txns.data.data.length === 0 ? (
        <EmptyState icon={Receipt} title="No transactions match" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Party</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="pr-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={txns.isFetching ? "opacity-60" : undefined}>
              {txns.data.data.map((t) => {
                const [tone, label] = TXN_TONE[t.type]
                return (
                  <TableRow key={`${t.type}-${t.id}`}>
                    <TableCell className="whitespace-nowrap pl-5 text-sm text-muted-foreground">{formatDateTime(t.date)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm">{t.party ?? "—"}</TableCell>
                    <TableCell className="hidden max-w-56 truncate font-mono text-xs text-muted-foreground md:table-cell">{t.reference ?? t.id}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{t.status.toLowerCase().replace(/_/g, " ")}</TableCell>
                    <TableCell className={`pr-5 text-right font-medium tabular-nums ${t.amount < 0 ? "text-muted-foreground" : ""}`}>
                      {t.amount < 0 ? `−${formatCents(-t.amount)}` : formatCents(t.amount)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="px-5 pb-5">
        {txns.data && <Pagination page={page} pageSize={PAGE_SIZE} total={txns.data.total} loading={txns.isFetching} onPageChange={setPage} />}
      </div>
    </SectionCard>
  )
}
