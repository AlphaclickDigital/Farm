"use client"

import { AlertTriangle, Boxes, Package, PackagePlus, PackageX, Store } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatNumber } from "@/lib/format"
import type { AdminProducts } from "@/lib/dashboard-types"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { BarList } from "@/components/dashboard/charts"
import { EmptyState, LoadingBlock, PageHeader, QueryBoundary, SectionCard, StatTile } from "@/components/dashboard/primitives"

export default function AdminProductsAnalyticsPage() {
  const report = useAnalytics<AdminProducts>("/analytics/admin/products")
  const d = report.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product & category analytics"
        description="Listed products are active products from approved, non-suspended farms — what shoppers can actually buy."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/products" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {d ? (
          <>
            <StatTile label="Total products" value={formatNumber(d.counts.total)} icon={Boxes} />
            <StatTile label="Active" value={formatNumber(d.counts.active)} icon={Package} tone="good" />
            <StatTile label="Listed for sale" value={formatNumber(d.counts.listed)} sub="Active, approved farms" icon={Store} tone="info" />
            <StatTile label="Added this period" value={formatNumber(d.counts.newInRange)} icon={PackagePlus} />
            <StatTile label="Low stock" value={formatNumber(d.stock.low)} sub="Of listed products" icon={AlertTriangle} tone={d.stock.low ? "warning" : "default"} />
            <StatTile label="Out of stock" value={formatNumber(d.stock.out)} sub="Of listed products" icon={PackageX} tone={d.stock.out ? "critical" : "default"} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        )}
      </div>

      <QueryBoundary query={report} skeleton={<LoadingBlock className="h-96" />}>
        {(data) => (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Sales by category" description="Gross sales in this period">
                {data.categorySales.length === 0 ? (
                  <EmptyState icon={Boxes} title="No sales in this period" />
                ) : (
                  <BarList items={data.categorySales.map((c) => ({ key: c.categoryId, label: c.name, value: c.revenue, sub: `${formatNumber(c.items)} items` }))} />
                )}
              </SectionCard>
              <SectionCard title="Catalogue by category" description="Number of products (active / total)">
                <BarList
                  format="number"
                  items={data.categoryDistribution.map((c) => ({ key: c.categoryId, label: c.name, value: c.products }))}
                  valueLabel={(item) => {
                    const c = data.categoryDistribution.find((x) => x.categoryId === item.key)
                    return `${formatNumber(c?.active ?? 0)} / ${formatNumber(item.value)}`
                  }}
                />
              </SectionCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <SectionCard title="Highest revenue" description="Top 10 products by gross sales">
                {data.topProducts.length === 0 ? (
                  <EmptyState icon={Package} title="No sales in this period" />
                ) : (
                  <BarList items={data.topProducts.map((p) => ({ key: p.productId, label: p.name, value: p.revenue, sub: p.storeName }))} />
                )}
              </SectionCard>
              <SectionCard title="Most popular" description="Top 10 by items sold">
                {data.topProducts.length === 0 ? (
                  <EmptyState icon={Package} title="No sales in this period" />
                ) : (
                  <BarList
                    format="number"
                    items={[...data.topProducts]
                      .sort((a, b) => b.items - a.items)
                      .map((p) => ({ key: p.productId, label: p.name, value: p.items, sub: p.storeName }))}
                    valueLabel={(item) => `${formatNumber(item.value)} sold`}
                  />
                )}
              </SectionCard>
              <SectionCard title="Lowest performing" description="Listed for the whole period, fewest sales">
                {data.lowestProducts.length === 0 ? (
                  <EmptyState icon={Package} title="Not enough history yet" />
                ) : (
                  <ul className="divide-y">
                    {data.lowestProducts.map((p) => (
                      <li key={p.productId} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate">{p.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.storeName}</p>
                        </div>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{p.revenue ? formatCents(p.revenue) : "No sales"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  )
}
