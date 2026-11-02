"use client"

import { Suspense, useEffect, useState } from "react"
import { BarChart3, Package, Search, Tags } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAnalytics } from "@/lib/use-analytics"
import { formatBaseUnits, formatCents, formatDateShort, formatNumber, formatPercent } from "@/lib/format"
import type { ProductPerformance, SalesSeries, VendorBreakdown } from "@/lib/dashboard-types"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQueryState } from "@/hooks/use-query-state"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { BarList, SegmentedBar, TrendChart } from "@/components/dashboard/charts"
import { StockBadge } from "@/components/dashboard/status-badge"
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
} from "@/components/dashboard/primitives"

type Metric = "gross" | "orders" | "items"
type Grouping = "auto" | "day" | "week" | "month"

const STATUS_LABELS: Record<string, string> = {
  PROCESSING: "To fulfil",
  PAID: "Paid",
  SHIPPED: "Shipped",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "best", label: "Best sellers" },
  { value: "lowest", label: "Lowest sellers" },
  { value: "most_viewed", label: "Most viewed" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
] as const

const PAGE_SIZE = 10

function VendorAnalytics() {
  const query = useQueryState()
  const [metric, setMetric] = useState<Metric>("gross")
  const [grouping, setGrouping] = useState<Grouping>("auto")
  const filter = query.get("filter") || "all"
  const page = Number(query.get("page")) || 1
  const [search, setSearch] = useState("")
  const debounced = useDebouncedValue(search, 300)

  const sales = useAnalytics<SalesSeries>("/analytics/vendor/sales", { granularity: grouping === "auto" ? undefined : grouping })
  const breakdown = useAnalytics<VendorBreakdown>("/analytics/vendor/breakdown")
  const products = useAnalytics<ProductPerformance>("/analytics/vendor/products", {
    filter,
    q: debounced,
    page,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    if (page !== 1) query.set({ page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const metricLabel = metric === "gross" ? "Gross sales" : metric === "orders" ? "Orders" : "Items sold"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="How your products are selling, and where your revenue comes from."
        actions={
          <>
            <ExportButton path="/analytics/vendor/export/sales" label="Export sales" />
            <DateRangePicker />
          </>
        }
      />

      <SectionCard
        title="Sales over time"
        description="Each point is compared with the same point in the previous period"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<Metric>
              size="xs"
              ariaLabel="Metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "gross", label: "Sales" },
                { value: "orders", label: "Orders" },
                { value: "items", label: "Items" },
              ]}
            />
            <SegmentedControl<Grouping>
              size="xs"
              ariaLabel="Group by"
              value={grouping}
              onChange={setGrouping}
              options={[
                { value: "auto", label: "Auto" },
                { value: "day", label: "Daily" },
                { value: "week", label: "Weekly" },
                { value: "month", label: "Monthly" },
              ]}
            />
          </div>
        }
      >
        <QueryBoundary query={sales} skeleton={<LoadingBlock className="h-80" />}>
          {(data) => (
            <TrendChart
              height={320}
              granularity={data.range.granularity}
              format={metric === "gross" ? "currency" : "number"}
              currentLabel={metricLabel}
              data={data.points.map((p) => ({
                bucket: p.bucket,
                prevBucket: p.prevBucket,
                current: metric === "gross" ? p.gross : metric === "orders" ? p.orders : p.items,
                // Items aren't tracked per previous bucket; compare sales and orders only.
                previous: metric === "gross" ? p.prevGross : metric === "orders" ? p.prevOrders : undefined,
              }))}
              showPrevious={metric !== "items"}
            />
          )}
        </QueryBoundary>
      </SectionCard>

      <QueryBoundary
        query={breakdown}
        skeleton={
          <div className="grid gap-4 lg:grid-cols-3">
            <LoadingBlock className="h-72" />
            <LoadingBlock className="h-72" />
            <LoadingBlock className="h-72" />
          </div>
        }
      >
        {(data) => (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Revenue contribution" description="Share of gross sales by product">
                {data.contribution.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No sales in this period" />
                ) : (
                  <SegmentedBar
                    segments={data.contribution.map((c) => ({
                      key: c.productId,
                      label: c.name,
                      value: c.revenue,
                      other: c.productId === "other",
                    }))}
                  />
                )}
              </SectionCard>
              <SectionCard title="Sales by category">
                {data.byCategory.length === 0 ? (
                  <EmptyState icon={Tags} title="No category sales yet" />
                ) : (
                  <BarList
                    items={data.byCategory.map((c) => ({
                      key: c.categoryId,
                      label: c.name,
                      value: c.revenue,
                      sub: `${formatNumber(c.orders)} orders`,
                    }))}
                  />
                )}
              </SectionCard>
              <SectionCard title="Orders by status" description="Orders placed in this period">
                {data.statuses.length === 0 ? (
                  <EmptyState icon={Package} title="No orders in this period" />
                ) : (
                  <BarList
                    format="number"
                    items={[...data.statuses]
                      .sort((a, b) => b.count - a.count)
                      .map((s) => ({
                        key: s.status,
                        label: STATUS_LABELS[s.status] ?? s.status,
                        value: s.count,
                        sub: formatCents(s.gross),
                      }))}
                  />
                )}
              </SectionCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Best performers" description="Highest gross sales">
                {data.best.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No sales yet" />
                ) : (
                  <BarList
                    items={data.best.map((p) => ({
                      key: p.productId,
                      label: p.name,
                      value: p.revenue,
                      sub: `${formatNumber(p.items)} sold · ${formatBaseUnits(p.baseUnits, p.baseUnit)}`,
                    }))}
                  />
                )}
              </SectionCard>
              <SectionCard title="Needs a boost" description="Active products with the lowest sales">
                {data.lowest.length === 0 ? (
                  <EmptyState icon={Package} title="No active products" />
                ) : (
                  <ul className="divide-y">
                    {data.lowest.map((p) => (
                      <li key={p.productId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          <StockBadge state={p.stockState} />
                          <span className="w-20 text-right tabular-nums text-muted-foreground">
                            {p.revenue ? formatCents(p.revenue) : "No sales"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </QueryBoundary>

      <SectionCard
        title="Product performance"
        description={
          products.data?.viewTrackingSince
            ? `Views counted since ${formatDateShort(products.data.viewTrackingSince)}, once per visitor per day.`
            : "Views and conversion appear once shoppers start visiting your product pages."
        }
        action={<ExportButton path="/analytics/vendor/export/products" label="Export" params={{ filter }} />}
        contentClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b px-4 pb-4 pt-1 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            ariaLabel="Product filter"
            value={filter}
            onChange={(value) => query.set({ filter: value === "all" ? null : value, page: null })}
            options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="h-8 pl-8 lg:w-56" aria-label="Search products" />
          </div>
        </div>
        {products.error && !products.data ? (
          <ErrorState message={products.error.message} onRetry={() => products.refetch()} />
        ) : !products.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : products.data.data.length === 0 ? (
          <EmptyState icon={Package} title="No products match" description="Try another filter or search." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="hidden md:table-cell">Trend</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Views</TableHead>
                  <TableHead className="hidden pr-4 text-right lg:table-cell">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={products.isFetching ? "opacity-60 transition-opacity" : undefined}>
                {products.data.data.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="size-9 shrink-0 rounded-md border object-cover" />
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Package className="size-4 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-56 truncate font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.category}
                            {!p.isActive && " · hidden"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(p.itemsSold)}</TableCell>
                    <TableCell className="text-right">
                      <p className="font-medium tabular-nums">{formatCents(p.revenue)}</p>
                      {p.revenueShare > 0 && <p className="text-[11px] text-muted-foreground">{formatPercent(p.revenueShare)} of sales</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <DeltaBadge change={p.trend} hasValue={p.revenue > 0} />
                    </TableCell>
                    <TableCell>
                      <StockBadge state={p.stockState} />
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.smallestVariant
                          ? `${formatNumber(p.sellableUnits)} × ${p.smallestVariant.label}`
                          : formatBaseUnits(p.stockAmount, p.baseUnit)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatNumber(p.views)}</TableCell>
                    <TableCell className="hidden pr-4 text-right tabular-nums lg:table-cell">{formatPercent(p.conversionRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-4 pb-4">
          {products.data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={products.data.total}
              loading={products.isFetching}
              onPageChange={(p) => query.set({ page: p === 1 ? null : p })}
            />
          )}
        </div>
      </SectionCard>
    </div>
  )
}

export default function VendorAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <VendorAnalytics />
    </Suspense>
  )
}
