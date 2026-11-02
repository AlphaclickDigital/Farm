"use client"

import { MapPin } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatNumber, formatPercent } from "@/lib/format"
import type { GeographyReport } from "@/lib/dashboard-types"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { BarList } from "@/components/dashboard/charts"
import { EmptyState, LoadingBlock, PageHeader, QueryBoundary, SectionCard, StatTile } from "@/components/dashboard/primitives"

const STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
  Unknown: "Not specified",
}

export default function GeographyPage() {
  const report = useAnalytics<GeographyReport>("/analytics/admin/geography")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Geography"
        description="Where customers order from (shipping state) and where farms are based. Free-text states are normalised to state codes."
        actions={<DateRangePicker />}
      />

      <QueryBoundary query={report} skeleton={<LoadingBlock className="h-96" />}>
        {(data) => {
          const withSales = data.states.filter((s) => s.state !== "Unknown")
          const totalOrders = data.states.reduce((s, r) => s + r.orders, 0)
          const top = data.states.find((s) => s.state === data.topRegion)
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Top region by GMV" value={data.topRegion ?? "—"} sub={top ? `${formatCents(top.gmv)} · ${formatPercent(top.gmvShare)} of GMV` : "No sales yet"} icon={MapPin} tone="good" />
                <StatTile label="States with orders" value={`${withSales.filter((s) => s.orders > 0).length} / 8`} icon={MapPin} />
                <StatTile label="States with farms" value={`${withSales.filter((s) => s.vendors > 0).length} / 8`} icon={MapPin} />
                <StatTile label="Orders this period" value={formatNumber(totalOrders)} icon={MapPin} />
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <SectionCard title="GMV by customer state" description="Where products are shipped to">
                  {totalOrders === 0 ? (
                    <EmptyState icon={MapPin} title="No orders in this period" />
                  ) : (
                    <BarList items={data.states.filter((s) => s.gmv > 0).map((s) => ({ key: s.state, label: STATE_NAMES[s.state] ?? s.state, value: s.gmv, sub: `${formatNumber(s.orders)} orders` }))} />
                  )}
                </SectionCard>
                <SectionCard title="Sales by farm state" description="Where products ship from">
                  <BarList
                    items={[...data.states]
                      .filter((s) => s.vendorGmv > 0)
                      .sort((a, b) => b.vendorGmv - a.vendorGmv)
                      .map((s) => ({ key: s.state, label: STATE_NAMES[s.state] ?? s.state, value: s.vendorGmv, sub: `${formatNumber(s.vendors)} farms` }))}
                  />
                </SectionCard>
                <SectionCard title="Customers by state" description="All-time buyers, by their latest shipping state">
                  <BarList
                    format="number"
                    items={[...data.states]
                      .filter((s) => s.buyers > 0)
                      .sort((a, b) => b.buyers - a.buyers)
                      .map((s) => ({ key: s.state, label: STATE_NAMES[s.state] ?? s.state, value: s.buyers }))}
                    valueLabel={(item) => `${formatNumber(item.value)} buyers`}
                  />
                </SectionCard>
              </div>

              <SectionCard title="By state" contentClassName="p-0 pt-2">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">State</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">GMV</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Share</TableHead>
                        <TableHead className="text-right">Farms</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Farm sales</TableHead>
                        <TableHead className="pr-5 text-right">Buyers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.states.map((s) => (
                        <TableRow key={s.state}>
                          <TableCell className="pl-5">
                            <span className="font-medium">{s.state}</span>
                            <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{STATE_NAMES[s.state]}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(s.orders)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCents(s.gmv)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{formatPercent(s.gmvShare)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(s.vendors)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{formatCents(s.vendorGmv)}</TableCell>
                          <TableCell className="pr-5 text-right tabular-nums">{formatNumber(s.buyers)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>
            </>
          )
        }}
      </QueryBoundary>
    </div>
  )
}
