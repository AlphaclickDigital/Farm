"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  BadgePercent,
  Boxes,
  CircleDollarSign,
  ExternalLink,
  Eye,
  Megaphone,
  Package,
  PackageCheck,
  Plus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/api"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateShort, formatNumber, formatPercent, shortId } from "@/lib/format"
import type {
  InventoryReport,
  OrderInsights,
  SalesSeries,
  VendorBreakdown,
  VendorKpis,
  VendorReviews,
  VendorSummary,
} from "@/lib/dashboard-types"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { InsightsPanel, type Insight } from "@/components/dashboard/insights-panel"
import { BarList, TrendChart } from "@/components/dashboard/charts"
import { OrderStatusBadge, StateBadge, StockBadge } from "@/components/dashboard/status-badge"
import { EmptyState, LoadingBlock, QueryBoundary, SectionCard, SegmentedControl, StatTile } from "@/components/dashboard/primitives"

type TrendMetric = "gross" | "orders" | "earnings"

function greeting() {
  const hour = Number(new Date().toLocaleString("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Sydney" }))
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
}

export default function VendorOverviewPage() {
  const summary = useApi<VendorSummary>("/analytics/vendor/summary")
  const kpis = useAnalytics<VendorKpis>("/analytics/vendor/kpis")
  const sales = useAnalytics<SalesSeries>("/analytics/vendor/sales")
  const orders = useAnalytics<OrderInsights>("/analytics/vendor/orders/insights")
  const breakdown = useAnalytics<VendorBreakdown>("/analytics/vendor/breakdown")
  const insights = useAnalytics<Insight[]>("/analytics/vendor/insights")
  const reviews = useAnalytics<VendorReviews>("/analytics/vendor/reviews")
  const inventory = useApi<InventoryReport>("/analytics/vendor/inventory")
  const [metric, setMetric] = useState<TrendMetric>("gross")

  const s = summary.data
  const k = kpis.data?.kpis
  const firstName = s?.ownerName?.split(" ")[0]
  const conversion = k?.conversionRate

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          {s?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.photo} alt="" className="size-14 rounded-xl border object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10">
              <Store className="size-6 text-primary" />
            </span>
          )}
          <div className="min-w-0">
            {s ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {greeting()}
                  {firstName ? `, ${firstName}` : ""}
                </p>
                <h1 className="truncate text-2xl font-semibold tracking-tight">{s.storeName}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <StateBadge state={s.status} />
                  <StateBadge state={s.stripe.ready ? "ready" : s.stripe.connected ? "incomplete" : "none"} />
                  <span className="text-xs text-muted-foreground">Stripe payouts</span>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-7 w-56" />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/vendor/dashboard/products/new">
              <Plus /> Add product
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/vendor/dashboard/orders?status=open">
              <ShoppingCart /> Manage orders
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/vendor/dashboard/promotions">
              <Megaphone /> Promote
            </Link>
          </Button>
          {s && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/vendors/${s.id}`} target="_blank">
                <ExternalLink /> View store
              </Link>
            </Button>
          )}
          <DateRangePicker />
        </div>
      </div>

      {s?.status === "pending" && (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Your store is awaiting approval</p>
            <p className="text-muted-foreground">
              Keep adding products and setting up shipping. Everything goes live the moment an admin approves your store.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Gross sales"
          icon={CircleDollarSign}
          loading={!k}
          value={k && formatCents(k.grossSales.value)}
          change={k?.grossSales.change}
          spark={k?.grossSales.spark}
          hint="Product sales before commission, excluding shipping, cancelled and refunded orders."
          href="/vendor/dashboard/analytics"
        />
        <KpiCard
          label="Orders"
          icon={ShoppingBag}
          loading={!k}
          value={k && formatNumber(k.orders.value)}
          change={k?.orders.change}
          spark={k?.orders.spark}
          href="/vendor/dashboard/orders"
        />
        <KpiCard
          label="Net earnings"
          icon={Wallet}
          loading={!k}
          value={k && formatCents(k.netEarnings.value)}
          change={k?.netEarnings.change}
          spark={k?.netEarnings.spark}
          hint="What you'll be paid: sales minus marketplace commission, plus the shipping you charged."
          href="/vendor/dashboard/earnings"
        />
        <KpiCard
          label="Average order value"
          icon={Receipt}
          loading={!k}
          value={k && formatCents(k.aov.value)}
          change={k?.aov.change}
          spark={k?.aov.spark}
          hint="Gross sales ÷ orders, excluding shipping."
        />
        <KpiCard
          label="Items sold"
          icon={PackageCheck}
          loading={!k}
          value={k && formatNumber(k.itemsSold.value)}
          change={k?.itemsSold.change}
          spark={k?.itemsSold.spark}
          hint="Number of packs/variants sold (e.g. 2 × 500g bag = 2)."
        />
        <KpiCard
          label="Store conversion"
          icon={Eye}
          loading={!k}
          value={conversion?.value === null || conversion === undefined ? "—" : formatPercent(conversion.value)}
          change={conversion?.change}
          hint="Orders ÷ product page views. Views are counted once per visitor per day."
          footnote={
            conversion && conversion.value === null ? (
              <span>
                {conversion.trackingSince
                  ? `No product views in this period`
                  : "View tracking starts with your next visitor"}
              </span>
            ) : conversion ? (
              <span>
                {formatNumber(conversion.views)} product views
                {conversion.measuredFrom && ` since ${formatDateShort(conversion.measuredFrom)}`}
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Sales trend + insights */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Sales performance"
          description="Compared with the previous period"
          action={
            <SegmentedControl<TrendMetric>
              size="xs"
              ariaLabel="Chart metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "gross", label: "Sales" },
                { value: "orders", label: "Orders" },
                { value: "earnings", label: "Earnings" },
              ]}
            />
          }
        >
          <QueryBoundary query={sales} skeleton={<LoadingBlock className="h-72" />}>
            {(data) =>
              data.points.every((p) => p.orders === 0 && p.prevOrders === 0) ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No sales in this period"
                  description="Once customers order, your sales trend will appear here."
                />
              ) : (
                <TrendChart
                  height={340}
                  granularity={data.range.granularity}
                  format={metric === "orders" ? "number" : "currency"}
                  currentLabel={metric === "gross" ? "Gross sales" : metric === "orders" ? "Orders" : "Net earnings"}
                  data={data.points.map((p) => ({
                    bucket: p.bucket,
                    prevBucket: p.prevBucket,
                    current: metric === "gross" ? p.gross : metric === "orders" ? p.orders : p.earnings,
                    previous: metric === "gross" ? p.prevGross : metric === "orders" ? p.prevOrders : p.prevEarnings,
                  }))}
                />
              )
            }
          </QueryBoundary>
        </SectionCard>

        <SectionCard title="Recommendations" description="Based on your recent sales, stock and reviews">
          <InsightsPanel insights={insights.data} loading={insights.isLoading} limit={4} />
        </SectionCard>
      </div>

      {/* Orders + inventory */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Orders"
          description="What needs doing now, and your latest orders"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/vendor/dashboard/orders">View all</Link>
            </Button>
          }
        >
          <QueryBoundary query={orders} skeleton={<LoadingBlock className="h-64" />}>
            {(data) => (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatTile label="To fulfil" value={data.pipeline.toFulfil} icon={Package} tone={data.pipeline.toFulfil ? "warning" : "default"} href="/vendor/dashboard/orders?status=open" />
                  <StatTile label="Waiting > 2 days" value={data.pipeline.overdue} icon={AlertTriangle} tone={data.pipeline.overdue ? "critical" : "default"} href="/vendor/dashboard/orders?status=open" />
                  <StatTile label="Awaiting pickup" value={data.pipeline.awaitingPickup} icon={Store} href="/vendor/dashboard/orders?status=open" />
                  <StatTile label="In transit" value={data.pipeline.shipped} icon={Truck} tone="info" href="/vendor/dashboard/orders?status=SHIPPED" />
                </div>
                {data.recent.length === 0 ? (
                  <EmptyState icon={ShoppingCart} title="No orders yet" description="New orders will show up here as soon as they're placed." />
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {data.recent.map((o) => (
                      <li key={o.id}>
                        <Link href={`/vendor/dashboard/orders/${o.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50">
                          <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{shortId(o.id)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{o.customer.name || "Customer"}</span>
                            <span className="text-muted-foreground"> · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span>
                          </span>
                          <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateShort(o.createdAt)}</span>
                          <OrderStatusBadge status={o.status} />
                          <span className="w-20 text-right font-medium tabular-nums">{formatCents(o.subtotalCents)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </QueryBoundary>
        </SectionCard>

        <SectionCard
          title="Inventory alerts"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/vendor/dashboard/inventory">Inventory</Link>
            </Button>
          }
        >
          <QueryBoundary query={inventory} skeleton={<LoadingBlock className="h-64" />}>
            {(data) => {
              const alerts = data.rows
                .filter((r) => r.state === "out" || r.state === "low")
                .sort((a, b) => (a.state === b.state ? a.sellableUnits - b.sellableUnits : a.state === "out" ? -1 : 1))
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2.5">
                      <p className="text-lg font-semibold tabular-nums">{data.summary.inStock}</p>
                      <p className="text-[11px] text-muted-foreground">In stock</p>
                    </div>
                    <div className="rounded-lg bg-warning/10 p-2.5">
                      <p className="text-lg font-semibold tabular-nums text-warning">{data.summary.lowStock}</p>
                      <p className="text-[11px] text-muted-foreground">Low</p>
                    </div>
                    <div className="rounded-lg bg-critical/10 p-2.5">
                      <p className="text-lg font-semibold tabular-nums text-critical">{data.summary.outOfStock}</p>
                      <p className="text-[11px] text-muted-foreground">Out</p>
                    </div>
                  </div>
                  {alerts.length === 0 ? (
                    <EmptyState icon={Boxes} title="Stock looks healthy" description="We'll warn you here before anything runs out." className="py-4" />
                  ) : (
                    <ul className="space-y-2">
                      {alerts.slice(0, 5).map((r) => (
                        <li key={r.productId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">{r.name}</span>
                          <StockBadge state={r.state} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            }}
          </QueryBoundary>
        </SectionCard>
      </div>

      {/* Products + reputation */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Top products"
          description="By gross sales in this period"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/vendor/dashboard/analytics">Analytics</Link>
            </Button>
          }
        >
          <QueryBoundary query={breakdown} skeleton={<LoadingBlock className="h-56" />}>
            {(data) =>
              data.best.length === 0 ? (
                <EmptyState icon={BadgePercent} title="No product sales yet" description="Your best sellers will be ranked here." />
              ) : (
                <BarList
                  items={data.best.map((p) => ({
                    key: p.productId,
                    label: p.name,
                    value: p.revenue,
                    sub: `${formatNumber(p.items)} sold`,
                  }))}
                />
              )
            }
          </QueryBoundary>
        </SectionCard>

        <SectionCard
          title="Reputation"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/vendor/dashboard/reviews">Reviews</Link>
            </Button>
          }
        >
          <QueryBoundary query={reviews} skeleton={<LoadingBlock className="h-56" />}>
            {(data) =>
              data.total === 0 ? (
                <EmptyState icon={Star} title="No reviews yet" description="Customers can review products after their order is completed." />
              ) : (
                <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
                  <div className="text-center sm:text-left">
                    <p className="text-4xl font-semibold tabular-nums">{data.average.toFixed(1)}</p>
                    <p className="mt-1 flex items-center justify-center gap-0.5 sm:justify-start" aria-label={`${data.average.toFixed(1)} out of 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={i < Math.round(data.average) ? "size-3.5 fill-gold text-gold" : "size-3.5 text-muted-foreground/40"} />
                      ))}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatNumber(data.total)} reviews</p>
                    {data.unanswered > 0 && (
                      <Link href="/vendor/dashboard/reviews?filter=unanswered" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                        {data.unanswered} awaiting reply
                      </Link>
                    )}
                  </div>
                  <ul className="space-y-1.5" aria-label="Rating distribution">
                    {data.distribution.map((d) => (
                      <li key={d.stars} className="flex items-center gap-2 text-xs">
                        <span className="w-8 tabular-nums text-muted-foreground">{d.stars}★</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-viz-1" style={{ width: `${data.total ? (d.count / data.total) * 100 : 0}%` }} />
                        </span>
                        <span className="w-8 text-right tabular-nums text-muted-foreground">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            }
          </QueryBoundary>
        </SectionCard>
      </div>
    </div>
  )
}
