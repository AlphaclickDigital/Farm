"use client"

import Link from "next/link"
import { Repeat, ShoppingBag, UserPlus, Users, Wallet } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateShort, formatNumber, formatPercent, formatRelative, guessGranularity } from "@/lib/format"
import type { VendorCustomers } from "@/lib/dashboard-types"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { BarList, ColumnChart } from "@/components/dashboard/charts"
import { OrderStatusBadge, StatusBadge } from "@/components/dashboard/status-badge"
import { EmptyState, LoadingBlock, PageHeader, QueryBoundary, SectionCard } from "@/components/dashboard/primitives"

export default function VendorCustomersPage() {
  const report = useAnalytics<VendorCustomers>("/analytics/vendor/customers")
  const d = report.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Who buys from you, how often they come back, and what they spend."
        actions={<DateRangePicker />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Customers this period"
          icon={Users}
          loading={!d}
          value={d && formatNumber(d.customers.value)}
          change={d?.customers.change}
          footnote={d && <span>{formatNumber(d.totalCustomers)} customers all time</span>}
        />
        <KpiCard label="New customers" icon={UserPlus} loading={!d} value={d && formatNumber(d.newCustomers.value)} change={d?.newCustomers.change} hint="First order with your store was in this period." />
        <KpiCard
          label="Returning customers"
          icon={Repeat}
          loading={!d}
          value={d && formatNumber(d.returningCustomers.value)}
          change={d?.returningCustomers.change}
          hint="Ordered in this period and had ordered from you before."
        />
        <KpiCard label="Average spend" icon={Wallet} loading={!d} value={d && formatCents(d.avgSpend.value)} change={d?.avgSpend.change} hint="Gross sales ÷ customers who ordered in this period." />
      </div>

      <QueryBoundary query={report} skeleton={<LoadingBlock className="h-80" />}>
        {(data) =>
          data.totalCustomers === 0 ? (
            <SectionCard>
              <EmptyState icon={Users} title="No customers yet" description="Customer insights appear after your first order." />
            </SectionCard>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-3">
                <SectionCard className="xl:col-span-2" title="New vs returning customers" description="Distinct customers ordering in each period">
                  <ColumnChart
                    stacked
                    format="number"
                    data={data.series}
                    series={[
                      { key: "newBuyers", label: "New" },
                      { key: "returningBuyers", label: "Returning" },
                    ]}
                    granularity={guessGranularity(data.series.map((s) => s.bucket))}
                  />
                </SectionCard>
                <SectionCard title="Loyalty" description="All-time order frequency">
                  <div className="mb-5 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{formatPercent(data.repeatRate)}</p>
                      <p className="text-xs text-muted-foreground">Repeat purchase rate</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">{formatCents(data.lifetimeValue)}</p>
                      <p className="text-xs text-muted-foreground">Avg. lifetime spend</p>
                    </div>
                  </div>
                  <BarList
                    format="number"
                    items={data.orderFrequency.map((f) => ({ key: f.label, label: f.label, value: f.count }))}
                    valueLabel={(item) => `${formatNumber(item.value)} customers`}
                  />
                </SectionCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <SectionCard className="xl:col-span-2" title="Top customers" description="By lifetime spend with your store" contentClassName="p-0 pt-2">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-5">Customer</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Spend</TableHead>
                          <TableHead className="hidden pr-5 sm:table-cell">Last order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.topCustomers.map((c) => (
                          <TableRow key={c.userId}>
                            <TableCell className="pl-5">
                              <p className="font-medium">{c.name || "Customer"}</p>
                              <p className="text-xs text-muted-foreground">{c.email}</p>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(c.orders)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatCents(c.spend)}</TableCell>
                            <TableCell className="hidden pr-5 text-sm text-muted-foreground sm:table-cell">{formatDateShort(c.lastOrderAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </SectionCard>
                <SectionCard title="Recent activity">
                  {data.recentActivity.length === 0 ? (
                    <EmptyState icon={ShoppingBag} title="No recent orders" />
                  ) : (
                    <ul className="space-y-3">
                      {data.recentActivity.map((a) => (
                        <li key={a.vendorOrderId}>
                          <Link href={`/vendor/dashboard/orders/${a.vendorOrderId}`} className="flex items-start justify-between gap-3 rounded-md text-sm hover:opacity-80">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {a.customerName}
                                {a.isFirstOrder && (
                                  <StatusBadge tone="info" className="ml-2 align-middle">
                                    First order
                                  </StatusBadge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatRelative(a.date)}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="font-medium tabular-nums">{formatCents(a.amount)}</span>
                              <OrderStatusBadge status={a.status} />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>
            </>
          )
        }
      </QueryBoundary>
    </div>
  )
}
