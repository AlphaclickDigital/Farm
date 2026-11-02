"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, Search, ShoppingCart, Store } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { qs, useApi } from "@/lib/api"
import { formatCents, formatDateTime, shortId } from "@/lib/format"
import type { VendorOrderList } from "@/lib/dashboard-types"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQueryState } from "@/hooks/use-query-state"
import { useRangeParams } from "@/store/use-dashboard-range"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { OrderStatusBadge, PayoutStateBadge } from "@/components/dashboard/status-badge"
import { EmptyState, ErrorState, PageHeader, Pagination, SectionCard, SegmentedControl } from "@/components/dashboard/primitives"
import { Skeleton } from "@/components/ui/skeleton"

const PAGE_SIZE = 20

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "open", label: "To fulfil" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
] as const

const SORTS = {
  newest: { sort: "date", dir: "desc", label: "Newest first" },
  oldest: { sort: "date", dir: "asc", label: "Oldest first" },
  high: { sort: "amount", dir: "desc", label: "Highest amount" },
  low: { sort: "amount", dir: "asc", label: "Lowest amount" },
} as const

function VendorOrders() {
  const query = useQueryState()
  const status = query.get("status") || "all"
  const page = Number(query.get("page")) || 1
  const sortKey = (query.get("sort") || "newest") as keyof typeof SORTS
  const period = query.get("period") === "range" ? "range" : "all"
  const [search, setSearch] = useState(query.get("q"))
  const debounced = useDebouncedValue(search, 300)
  const range = useRangeParams()

  // Push the debounced search into the URL and reset to page 1.
  useEffect(() => {
    if (debounced !== query.get("q")) query.set({ q: debounced, page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const sort = SORTS[sortKey] ?? SORTS.newest
  const orders = useApi<VendorOrderList>(
    `/analytics/vendor/orders${qs({
      page,
      pageSize: PAGE_SIZE,
      status,
      q: query.get("q"),
      sort: sort.sort,
      dir: sort.dir,
      ...(period === "range" ? range : { allTime: true }),
    })}`,
  )
  const counts = orders.data?.statusCounts ?? {}
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const countFor = (tab: string) =>
    tab === "all" ? total : tab === "open" ? (counts.PAID ?? 0) + (counts.PROCESSING ?? 0) : (counts[tab] ?? 0)

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Track, fulfil and review every order placed with your store."
        actions={<ExportButton path="/analytics/vendor/export/orders" label="Export" />}
      />

      <SectionCard contentClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            ariaLabel="Order status"
            value={status}
            onChange={(value) => query.set({ status: value === "all" ? null : value, page: null })}
            options={STATUS_TABS.map((t) => ({ value: t.value, label: t.label, count: orders.data ? countFor(t.value) : undefined }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order #, customer, product…"
                className="h-8 pl-8 sm:w-60"
                aria-label="Search orders"
              />
            </div>
            <Select value={sortKey} onValueChange={(value) => query.set({ sort: value === "newest" ? null : value, page: null })}>
              <SelectTrigger size="sm" className="sm:w-40" aria-label="Sort orders">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORTS).map(([key, s]) => (
                  <SelectItem key={key} value={key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(value) => query.set({ period: value === "all" ? null : value, page: null })}>
              <SelectTrigger size="sm" className="sm:w-36" aria-label="Order dates">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="range">Date range</SelectItem>
              </SelectContent>
            </Select>
            {period === "range" && <DateRangePicker />}
          </div>
        </div>

        {orders.error && !orders.data ? (
          <ErrorState message={orders.error.message} onRetry={() => orders.refetch()} />
        ) : !orders.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : orders.data.data.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={query.get("q") || status !== "all" ? "No orders match these filters" : "No orders yet"}
            description={query.get("q") || status !== "all" ? "Try a different search or status." : "When customers buy from your store, orders appear here."}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden lg:table-cell">Products</TableHead>
                  <TableHead className="hidden md:table-cell">Placed</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Payout</TableHead>
                  <TableHead className="w-8 pr-4">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={orders.isFetching ? "opacity-60 transition-opacity" : undefined}>
                {orders.data.data.map((o) => (
                  <TableRow key={o.id} className="group">
                    <TableCell className="pl-4">
                      <Link href={`/vendor/dashboard/orders/${o.id}`} className="font-mono text-xs font-medium hover:underline">
                        {shortId(o.id)}
                      </Link>
                      {o.isPickup && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Store className="size-3" /> Pickup
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{o.customer.name || "Customer"}</p>
                      <p className="text-xs text-muted-foreground">{o.destination ?? o.customer.email}</p>
                    </TableCell>
                    <TableCell className="hidden max-w-64 lg:table-cell">
                      <p className="truncate text-sm">
                        {o.items[0] && `${o.items[0].quantity} × ${o.items[0].name}${o.items[0].variant ? ` (${o.items[0].variant})` : ""}`}
                      </p>
                      {o.items.length > 1 && <p className="text-xs text-muted-foreground">+{o.items.length - 1} more</p>}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-medium tabular-nums">{formatCents(o.subtotalCents + o.shippingCents)}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">you earn {formatCents(o.payoutCents)}</p>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PayoutStateBadge state={o.payoutState} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <Link
                        href={`/vendor/dashboard/orders/${o.id}`}
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        aria-label={`Open order ${shortId(o.id)}`}
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-4 pb-4">
          {orders.data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={orders.data.total}
              loading={orders.isFetching}
              onPageChange={(p) => query.set({ page: p === 1 ? null : p })}
            />
          )}
        </div>
      </SectionCard>
    </div>
  )
}

export default function VendorOrdersPage() {
  return (
    <Suspense fallback={null}>
      <VendorOrders />
    </Suspense>
  )
}
