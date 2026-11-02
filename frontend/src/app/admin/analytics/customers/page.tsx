"use client"

import { Repeat, ShoppingBag, UserPlus, Users, Wallet, Gem } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateShort, formatNumber, formatPercent, guessGranularity } from "@/lib/format"
import type { AdminCustomers } from "@/lib/dashboard-types"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { BarList, ColumnChart } from "@/components/dashboard/charts"
import { EmptyState, LoadingBlock, PageHeader, QueryBoundary, SectionCard } from "@/components/dashboard/primitives"

export default function AdminCustomersPage() {
  const report = useAnalytics<AdminCustomers>("/analytics/admin/customers")
  const d = report.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer analytics"
        description="Registrations, buying behaviour and retention. Individual customers are shown by first name and masked email only."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/customers" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Registered customers"
          icon={Users}
          loading={!d}
          value={d && formatNumber(d.registeredCustomers)}
          footnote={d && <span>+{formatNumber(d.newRegistrations.value)} new this period</span>}
        />
        <KpiCard label="Buyers this period" icon={ShoppingBag} loading={!d} value={d && formatNumber(d.buyers.value)} change={d?.buyers.change} hint="Distinct customers with at least one order." />
        <KpiCard label="New buyers" icon={UserPlus} loading={!d} value={d && formatNumber(d.newBuyers.value)} change={d?.newBuyers.change} hint="First-ever order placed in this period." />
        <KpiCard label="Returning buyers" icon={Repeat} loading={!d} value={d && formatNumber(d.returningBuyers.value)} change={d?.returningBuyers.change} />
        <KpiCard label="Average spend" icon={Wallet} loading={!d} value={d && formatCents(d.avgSpend.value)} change={d?.avgSpend.change} hint="GMV ÷ buyers in this period." />
        <KpiCard
          label="Repeat purchase rate"
          icon={Repeat}
          loading={!d}
          value={d && formatPercent(d.repeatRate)}
          footnote={d && <span>{formatNumber(d.totalBuyers)} buyers all time</span>}
          hint="Share of all-time buyers with two or more orders."
        />
        <KpiCard
          label="Customer lifetime value"
          icon={Gem}
          loading={!d}
          value={d && formatCents(d.lifetimeValue)}
          footnote={<span>Average lifetime GMV per buyer</span>}
        />
        <KpiCard
          label="New registrations"
          icon={UserPlus}
          loading={!d}
          value={d && formatNumber(d.newRegistrations.value)}
          change={d?.newRegistrations.change}
        />
      </div>

      <QueryBoundary query={report} skeleton={<LoadingBlock className="h-80" />}>
        {(data) => {
          const granularity = guessGranularity(data.series.map((s) => s.bucket))
          return (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="New vs returning buyers">
                  <ColumnChart
                    stacked
                    format="number"
                    granularity={granularity}
                    data={data.series}
                    series={[
                      { key: "newBuyers", label: "New" },
                      { key: "returningBuyers", label: "Returning" },
                    ]}
                  />
                </SectionCard>
                <SectionCard title="Customer growth" description="New customer accounts">
                  <ColumnChart format="number" granularity={granularity} data={data.series} series={[{ key: "registrations", label: "Registrations" }]} />
                </SectionCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <SectionCard title="Retention" description="Buyers by number of orders (all time)">
                  <BarList
                    format="number"
                    items={data.orderFrequency.map((f) => ({ key: f.label, label: f.label, value: f.count }))}
                    valueLabel={(item) => `${formatNumber(item.value)} buyers`}
                  />
                </SectionCard>
                <SectionCard className="xl:col-span-2" title="Top customers" description="By lifetime GMV" contentClassName="p-0 pt-2">
                  {data.topCustomers.length === 0 ? (
                    <EmptyState icon={Users} title="No buyers yet" />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="pl-5">Customer</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead className="text-right">Lifetime spend</TableHead>
                            <TableHead className="hidden sm:table-cell">First order</TableHead>
                            <TableHead className="hidden pr-5 sm:table-cell">Last order</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.topCustomers.map((c) => (
                            <TableRow key={c.userId}>
                              <TableCell className="pl-5">
                                <p className="font-medium">{c.name ?? "Customer"}</p>
                                <p className="text-xs text-muted-foreground">{c.email}</p>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(c.orders)}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">{formatCents(c.spend)}</TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDateShort(c.firstOrderAt)}</TableCell>
                              <TableCell className="hidden pr-5 text-sm text-muted-foreground sm:table-cell">{formatDateShort(c.lastOrderAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </SectionCard>
              </div>
            </>
          )
        }}
      </QueryBoundary>
    </div>
  )
}
