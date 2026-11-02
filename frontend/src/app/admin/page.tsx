"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Activity,
  Boxes,
  CircleDollarSign,
  Landmark,
  Megaphone,
  ShoppingBag,
  Store,
  Tractor,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAnalytics } from "@/lib/use-analytics"
import { useApi } from "@/lib/api"
import { formatCents, formatNumber } from "@/lib/format"
import type { ActivityItem, AdminKpis, AdminOrdersOverview, LeaderboardRow, Paged, RevenueReport } from "@/lib/dashboard-types"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { InsightsPanel, type Insight } from "@/components/dashboard/insights-panel"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { BarList, TrendChart } from "@/components/dashboard/charts"
import { DeltaBadge, EmptyState, LoadingBlock, PageHeader, QueryBoundary, SectionCard, SegmentedControl } from "@/components/dashboard/primitives"

type Metric = "gmv" | "platformRevenue" | "orders"

const ORDER_STATUS_LABELS: Record<string, string> = {
  PAID: "Paid, not started",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  PENDING: "Pending",
}

export default function AdminOverviewPage() {
  const kpis = useAnalytics<AdminKpis>("/analytics/admin/kpis")
  const revenue = useAnalytics<RevenueReport>("/analytics/admin/revenue")
  const orders = useAnalytics<AdminOrdersOverview>("/analytics/admin/orders/overview")
  const leaders = useAnalytics<Paged<LeaderboardRow>>("/analytics/admin/vendors/leaderboard", { pageSize: 5, sort: "gmv" })
  const alerts = useApi<Insight[]>("/analytics/admin/alerts")
  const activity = useApi<ActivityItem[]>("/analytics/admin/activity?limit=8")
  const [metric, setMetric] = useState<Metric>("gmv")
  const k = kpis.data?.kpis

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace overview"
        description="GMV is the value of products sold by farms. Platform revenue is what the marketplace keeps: commission plus featured-listing fees."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/revenue" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Marketplace GMV"
          icon={ShoppingBag}
          loading={!k}
          value={k && formatCents(k.gmv.value)}
          change={k?.gmv.change}
          spark={k?.gmv.spark}
          hint="Product sales across all farms, excluding shipping, cancelled and refunded orders."
          href="/admin/analytics/revenue"
        />
        <KpiCard
          label="Platform revenue"
          icon={CircleDollarSign}
          loading={!k}
          value={k && formatCents(k.platformRevenue.value)}
          change={k?.platformRevenue.change}
          spark={k?.platformRevenue.spark}
          hint="Commission on sales plus featured-listing fees. Excludes vendor earnings and shipping."
          href="/admin/analytics/revenue"
        />
        <KpiCard label="Orders" icon={Landmark} loading={!k} value={k && formatNumber(k.orders.value)} change={k?.orders.change} spark={k?.orders.spark} href="/admin/orders" />
        <KpiCard
          label="Active selling vendors"
          icon={Tractor}
          loading={!k}
          value={k && formatNumber(k.activeVendors.value)}
          change={k?.activeVendors.change}
          hint="Farms with at least one sale in the period."
          href="/admin/analytics/vendors"
        />
        <KpiCard
          label="Total vendors"
          icon={Store}
          loading={!k}
          value={k && formatNumber(k.vendors.value)}
          footnote={k && <span>+{formatNumber(k.vendors.added)} this period</span>}
          href="/admin/vendors"
        />
        <KpiCard
          label="Registered customers"
          icon={Users}
          loading={!k}
          value={k && formatNumber(k.customers.value)}
          footnote={k && <span>+{formatNumber(k.customers.added)} this period</span>}
          href="/admin/analytics/customers"
        />
        <KpiCard
          label="Active products"
          icon={Boxes}
          loading={!k}
          value={k && formatNumber(k.products.value)}
          footnote={k && <span>+{formatNumber(k.products.added)} this period</span>}
          href="/admin/analytics/products"
        />
        <KpiCard
          label="Live promotions"
          icon={Megaphone}
          loading={!k}
          value={k && formatNumber(k.activePromotions.value)}
          footnote={k && <span>{formatNumber(k.activePromotions.previous)} at the start of the period</span>}
          href="/admin/promotions"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Marketplace performance"
          description="Compared with the previous period"
          action={
            <SegmentedControl<Metric>
              size="xs"
              ariaLabel="Chart metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "gmv", label: "GMV" },
                { value: "platformRevenue", label: "Revenue" },
                { value: "orders", label: "Orders" },
              ]}
            />
          }
        >
          <QueryBoundary query={revenue} skeleton={<LoadingBlock className="h-72" />}>
            {(data) => (
              <TrendChart
                height={360}
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

        <SectionCard title="Needs attention" description="Prioritised by urgency">
          <InsightsPanel insights={alerts.data} loading={alerts.isLoading} limit={4} emptyTitle="All clear" emptyDescription="No marketplace issues right now." />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SectionCard
          title="Orders by status"
          description="Orders placed in this period"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/orders">Orders</Link>
            </Button>
          }
        >
          <QueryBoundary query={orders} skeleton={<LoadingBlock className="h-56" />}>
            {(data) =>
              data.totalPlaced === 0 ? (
                <EmptyState icon={ShoppingBag} title="No orders in this period" />
              ) : (
                <div className="space-y-4">
                  <BarList
                    format="number"
                    items={[...data.statuses]
                      .sort((a, b) => b.count - a.count)
                      .map((s) => ({ key: s.status, label: ORDER_STATUS_LABELS[s.status] ?? s.status, value: s.count, href: `/admin/orders?status=${s.status}` }))}
                  />
                  <p className="border-t pt-3 text-xs text-muted-foreground">
                    {data.cancellationRate.toFixed(1)}% cancelled · {data.refundRate.toFixed(1)}% refunded (vendor orders)
                  </p>
                </div>
              )
            }
          </QueryBoundary>
        </SectionCard>

        <SectionCard
          title="Top vendors"
          description="By GMV in this period"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/analytics/vendors">Leaderboard</Link>
            </Button>
          }
        >
          <QueryBoundary query={leaders} skeleton={<LoadingBlock className="h-56" />}>
            {(data) =>
              data.data.every((v) => v.gmv === 0) ? (
                <EmptyState icon={Store} title="No vendor sales in this period" />
              ) : (
                <ul className="space-y-3">
                  {data.data
                    .filter((v) => v.gmv > 0)
                    .map((v, i) => (
                      <li key={v.id} className="flex items-center gap-3 text-sm">
                        <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{v.storeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(v.orders)} orders{v.state ? ` · ${v.state}` : ""}
                          </p>
                        </div>
                        <DeltaBadge change={v.trend} hasValue={v.gmv > 0} />
                        <span className="w-20 text-right font-medium tabular-nums">{formatCents(v.gmv)}</span>
                      </li>
                    ))}
                </ul>
              )
            }
          </QueryBoundary>
        </SectionCard>

        <SectionCard
          className="lg:col-span-2 xl:col-span-1"
          title="Recent activity"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/activity">View all</Link>
            </Button>
          }
        >
          <QueryBoundary query={activity} skeleton={<LoadingBlock className="h-56" />}>
            {(items) =>
              items.length === 0 ? (
                <EmptyState icon={Activity} title="No activity yet" />
              ) : (
                <ActivityTimeline items={items} />
              )
            }
          </QueryBoundary>
        </SectionCard>
      </div>
    </div>
  )
}
