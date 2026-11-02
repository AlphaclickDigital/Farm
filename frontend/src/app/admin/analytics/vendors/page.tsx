"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, CircleCheck, Clock, Search, Ban, Store, Tractor, UserPlus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateShort, formatNumber } from "@/lib/format"
import type { LeaderboardRow, Paged, VendorOverviewReport } from "@/lib/dashboard-types"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQueryState } from "@/hooks/use-query-state"
import { cn } from "@/lib/utils"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { BarList, ColumnChart } from "@/components/dashboard/charts"
import { StateBadge } from "@/components/dashboard/status-badge"
import { DeltaBadge, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, QueryBoundary, SectionCard, StatTile } from "@/components/dashboard/primitives"

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]
const PAGE_SIZE = 15

type SortKey = "gmv" | "orders" | "commission" | "aov" | "rating" | "createdAt" | "storeName" | "trend"

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value || "any"} onValueChange={(v) => onChange(v === "any" ? "" : v)}>
      <SelectTrigger size="sm" className="w-full sm:w-auto sm:min-w-32" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">{label}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function VendorPerformance() {
  const query = useQueryState()
  const overview = useAnalytics<VendorOverviewReport>("/analytics/admin/vendors")
  const [search, setSearch] = useState(query.get("q"))
  const debounced = useDebouncedValue(search, 300)
  const sort = (query.get("sort") || "gmv") as SortKey
  const dir = query.get("dir") === "asc" ? "asc" : "desc"
  const page = Number(query.get("page")) || 1

  useEffect(() => {
    if (debounced !== query.get("q")) query.set({ q: debounced, page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const filters = {
    state: query.get("state"),
    status: query.get("status"),
    stripe: query.get("stripe"),
    performance: query.get("performance"),
    registeredFrom: query.get("registeredFrom"),
  }
  const board = useAnalytics<Paged<LeaderboardRow>>("/analytics/admin/vendors/leaderboard", {
    ...filters,
    q: query.get("q"),
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
  })

  const setSort = (key: SortKey) =>
    query.set({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc", page: null })

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => setSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === k && "text-foreground")}>
        {children}
        {sort === k && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  )

  const c = overview.data?.counts

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor performance"
        description="How farms are growing and selling. Sales figures cover the selected period."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/vendors" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {c ? (
          <>
            <StatTile label="Registered vendors" value={formatNumber(c.total)} sub={`+${c.newVendors.value} this period`} icon={Store} />
            <StatTile label="Approved" value={formatNumber(c.approved)} icon={CircleCheck} tone="good" />
            <StatTile label="Pending applications" value={formatNumber(c.pending)} icon={Clock} tone={c.pending ? "warning" : "default"} href="/admin/vendors" />
            <StatTile label="Suspended" value={formatNumber(c.suspended)} icon={Ban} tone={c.suspended ? "critical" : "default"} />
            <StatTile label="Selling this period" value={formatNumber(c.activeSelling)} icon={Tractor} tone="info" />
            <StatTile label="Approved, no sales" value={formatNumber(c.noSalesInRange)} sub={`${c.neverSold} have never sold`} icon={UserPlus} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="New vendors" description="Registrations per period">
          <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-60" />}>
            {(data) => (
              <ColumnChart format="number" granularity={data.range.granularity} data={data.newSeries} series={[{ key: "registrations", label: "New vendors" }]} height={220} />
            )}
          </QueryBoundary>
        </SectionCard>
        <SectionCard title="Stripe onboarding" description="Approved, active vendors">
          <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-60" />}>
            {(data) => (
              <div className="space-y-5">
                <BarList
                  format="number"
                  items={[
                    { key: "ready", label: "Ready for payouts", value: data.stripe.ready, href: "/admin/analytics/vendors?stripe=ready" },
                    { key: "incomplete", label: "Onboarding incomplete", value: data.stripe.incomplete, href: "/admin/analytics/vendors?stripe=incomplete" },
                    { key: "none", label: "Not connected", value: data.stripe.none, href: "/admin/analytics/vendors?stripe=none" },
                  ]}
                />
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Vendors by state</p>
                  <BarList format="number" items={data.byState.map((s) => ({ key: s.state, label: s.state, value: s.count }))} />
                </div>
              </div>
            )}
          </QueryBoundary>
        </SectionCard>
      </div>

      <SectionCard title="Leaderboard" contentClassName="p-0">
        <div className="flex flex-col gap-2 border-b px-4 pb-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search farms…" className="h-8 pl-8 sm:w-48" aria-label="Search farms" />
          </div>
          <FilterSelect label="State" value={filters.state} onChange={(v) => query.set({ state: v, page: null })} options={STATES.map((s) => ({ value: s, label: s }))} />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => query.set({ status: v, page: null })}
            options={[
              { value: "approved", label: "Approved" },
              { value: "pending", label: "Pending" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
          <FilterSelect
            label="Stripe"
            value={filters.stripe}
            onChange={(v) => query.set({ stripe: v, page: null })}
            options={[
              { value: "ready", label: "Connected" },
              { value: "incomplete", label: "Incomplete" },
              { value: "none", label: "Not connected" },
            ]}
          />
          <FilterSelect
            label="Sales"
            value={filters.performance}
            onChange={(v) => query.set({ performance: v, page: null })}
            options={[
              { value: "selling", label: "Has sales" },
              { value: "no_sales", label: "No sales" },
              { value: "declining", label: "Declining (−25%+)" },
            ]}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Joined after
            <Input
              type="date"
              value={filters.registeredFrom}
              onChange={(e) => query.set({ registeredFrom: e.target.value, page: null })}
              className="h-8 w-auto text-xs"
            />
          </label>
        </div>
        {board.error && !board.data ? (
          <ErrorState message={board.error.message} onRetry={() => board.refetch()} />
        ) : !board.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : board.data.data.length === 0 ? (
          <EmptyState icon={Store} title="No vendors match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">#</TableHead>
                  <SortHead k="storeName">Farm</SortHead>
                  <SortHead k="orders" className="text-right">Orders</SortHead>
                  <SortHead k="gmv" className="text-right">GMV</SortHead>
                  <SortHead k="trend" className="hidden md:table-cell">Trend</SortHead>
                  <SortHead k="commission" className="hidden text-right lg:table-cell">Commission</SortHead>
                  <SortHead k="aov" className="hidden text-right lg:table-cell">AOV</SortHead>
                  <SortHead k="rating" className="hidden text-right md:table-cell">Rating</SortHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden pr-4 xl:table-cell">Stripe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={board.isFetching ? "opacity-60" : undefined}>
                {board.data.data.map((v, i) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-4 text-xs tabular-nums text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                    <TableCell>
                      <Link href={`/vendors/${v.id}`} target="_blank" className="font-medium hover:underline">
                        {v.storeName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[v.location, v.state].filter(Boolean).join(", ") || "Location not set"} · joined {formatDateShort(v.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(v.orders)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCents(v.gmv)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <DeltaBadge change={v.trend} hasValue={v.gmv > 0} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{formatCents(v.commission)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{v.orders ? formatCents(v.aov) : "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {v.rating === null ? <span className="text-muted-foreground">—</span> : `${v.rating.toFixed(1)}★`}
                      {v.reviews > 0 && <span className="ml-1 text-[11px] text-muted-foreground">({v.reviews})</span>}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={v.status} />
                    </TableCell>
                    <TableCell className="hidden pr-4 xl:table-cell">
                      <StateBadge state={v.stripe} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-4 pb-4">
          {board.data && <Pagination page={page} pageSize={PAGE_SIZE} total={board.data.total} loading={board.isFetching} onPageChange={(p) => query.set({ page: p === 1 ? null : p })} />}
        </div>
      </SectionCard>
    </div>
  )
}

export default function VendorPerformancePage() {
  return (
    <Suspense fallback={null}>
      <VendorPerformance />
    </Suspense>
  )
}
