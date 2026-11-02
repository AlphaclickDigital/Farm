"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronRight, ExternalLink, Loader2, Package, Search, ShoppingCart, ShoppingBag, Undo2 } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { apiFetch, qs, useAccessToken, useApi } from "@/lib/api"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateTime, formatNumber, formatPercent, shortId } from "@/lib/format"
import type { AdminOrderDetail, AdminOrderList, AdminOrdersOverview } from "@/lib/dashboard-types"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQueryState } from "@/hooks/use-query-state"
import { useRangeParams } from "@/store/use-dashboard-range"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { BarList, TrendChart } from "@/components/dashboard/charts"
import { OrderStatusBadge, StateBadge } from "@/components/dashboard/status-badge"
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, QueryBoundary, SectionCard, SegmentedControl, StatTile } from "@/components/dashboard/primitives"

const PAGE_SIZE = 20
const TABS = ["all", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDED"] as const
const TAB_LABEL: Record<string, string> = {
  all: "All",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
}

function AdminOrders() {
  const query = useQueryState()
  const status = query.get("status") || "all"
  const page = Number(query.get("page")) || 1
  const period = query.get("period") === "range" ? "range" : "all"
  const openOrder = query.get("order")
  const [search, setSearch] = useState(query.get("q"))
  const debounced = useDebouncedValue(search, 300)
  const range = useRangeParams()

  useEffect(() => {
    if (debounced !== query.get("q")) query.set({ q: debounced, page: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const overview = useAnalytics<AdminOrdersOverview>("/analytics/admin/orders/overview")
  const list = useApi<AdminOrderList>(
    `/analytics/admin/orders${qs({
      page,
      pageSize: PAGE_SIZE,
      status,
      q: query.get("q"),
      ...(period === "range" ? range : { allTime: true }),
    })}`,
  )
  const counts = list.data?.statusCounts ?? {}
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const o = overview.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every marketplace order and the farm orders inside it. Open an order to see items, payout state and refunds."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/orders" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {o ? (
          <>
            <StatTile label="Orders placed" value={formatNumber(o.totalPlaced)} sub="All statuses, this period" icon={ShoppingCart} />
            <StatTile label="Average order value" value={formatCents(o.aov.value)} sub="Merchandise only" icon={ShoppingBag} />
            <StatTile label="Cancellation rate" value={formatPercent(o.cancellationRate)} sub="Of farm orders" icon={Undo2} tone={o.cancellationRate > 10 ? "warning" : "default"} />
            <StatTile label="Refund rate" value={formatPercent(o.refundRate)} sub="Of farm orders" icon={Undo2} tone={o.refundRate > 5 ? "warning" : "default"} />
            <StatTile label="Unpaid checkouts" value={formatNumber(o.abandonedCheckouts)} sub="Payment started, never completed" icon={ShoppingCart} />
            <StatTile
              label="Multi-farm orders"
              value={formatPercent(((o.multiVendor.filter((m) => m.vendors > 1).reduce((s, m) => s + m.orders, 0)) / Math.max(1, o.multiVendor.reduce((s, m) => s + m.orders, 0))) * 100)}
              sub="Orders spanning 2+ farms"
              icon={Package}
            />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Orders over time" description="Excluding cancelled and refunded">
          <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-64" />}>
            {(data) => (
              <TrendChart
                height={240}
                format="number"
                granularity={data.range.granularity}
                currentLabel="Orders"
                data={data.series.map((p) => ({ bucket: p.bucket, current: p.orders, previous: p.prevOrders }))}
              />
            )}
          </QueryBoundary>
        </SectionCard>
        <SectionCard title="Orders by state" description="Customer shipping state">
          <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-64" />}>
            {(data) =>
              data.byState.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="No orders in this period" />
              ) : (
                <BarList format="number" items={data.byState.slice(0, 8).map((s) => ({ key: s.state, label: s.state, value: s.orders, sub: formatCents(s.gross) }))} />
              )
            }
          </QueryBoundary>
        </SectionCard>
      </div>

      <SectionCard contentClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            ariaLabel="Order status"
            value={status}
            onChange={(value) => query.set({ status: value === "all" ? null : value, page: null })}
            options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: list.data ? (t === "all" ? total : counts[t] ?? 0) : undefined }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, customer, farm…" className="h-8 pl-8 sm:w-60" aria-label="Search orders" />
            </div>
            <Select value={period} onValueChange={(v) => query.set({ period: v === "all" ? null : v, page: null })}>
              <SelectTrigger size="sm" className="sm:w-36" aria-label="Order dates">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="range">Date range</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {list.error && !list.data ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden lg:table-cell">Farms</TableHead>
                  <TableHead className="hidden md:table-cell">Placed</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8 pr-4">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={list.isFetching ? "opacity-60" : undefined}>
                {list.data.data.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer" onClick={() => query.set({ order: order.id })}>
                    <TableCell className="pl-4 font-mono text-xs font-medium">{shortId(order.id)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{order.user.name || "Customer"}</p>
                      <p className="text-xs text-muted-foreground">{[order.shippingCity, order.shippingState].filter(Boolean).join(", ") || order.user.email}</p>
                    </TableCell>
                    <TableCell className="hidden max-w-56 lg:table-cell">
                      <p className="truncate text-sm">{order.vendorOrders.map((v) => v.vendor.storeName).join(", ")}</p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">{formatDateTime(order.createdAt)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCents(order.totalAmountCents)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{formatCents(order.commissionCents)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={`Open order ${shortId(order.id)}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          query.set({ order: order.id })
                        }}
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-4 pb-4">
          {list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} loading={list.isFetching} onPageChange={(p) => query.set({ page: p === 1 ? null : p })} />}
        </div>
      </SectionCard>

      <OrderSheet orderId={openOrder || null} onClose={() => query.set({ order: null })} />
    </div>
  )
}

function OrderSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const token = useAccessToken()
  const queryClient = useQueryClient()
  const detail = useApi<AdminOrderDetail>(orderId ? `/analytics/admin/orders/${orderId}` : null)
  const [refundTarget, setRefundTarget] = useState<AdminOrderDetail["vendorOrders"][number] | null>(null)
  const [refunding, setRefunding] = useState(false)
  const d = detail.data && detail.data.id === orderId ? detail.data : undefined

  const refund = async () => {
    if (!refundTarget) return
    setRefunding(true)
    try {
      await apiFetch(`/orders/admin/orders/${refundTarget.id}/refund`, token, { method: "POST" })
      toast.success("Refund issued and stock restored")
      setRefundTarget(null)
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[1] ?? "").startsWith("/analytics/admin") })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refund failed")
    } finally {
      setRefunding(false)
    }
  }

  return (
    <>
      <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>{orderId ? `Order ${shortId(orderId)}` : "Order"}</SheetTitle>
            <SheetDescription>{d ? `${formatDateTime(d.createdAt)} · ${d.vendorOrders.length} farm${d.vendorOrders.length === 1 ? "" : "s"}` : "Loading…"}</SheetDescription>
          </SheetHeader>
          {detail.error && !d ? (
            <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />
          ) : !d ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <div className="space-y-5 p-4">
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{d.user.name || "Customer"}</p>
                  <p className="text-xs text-muted-foreground">{d.user.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{d.customerPreviousOrders} previous order{d.customerPreviousOrders === 1 ? "" : "s"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ship to</p>
                  <p className="text-sm">{d.shippingName}</p>
                  <p className="text-xs text-muted-foreground">
                    {[d.shippingAddress, d.shippingCity, d.shippingState, d.shippingZip].filter(Boolean).join(", ") || "No address (pickup)"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Charged</p>
                  <p className="font-medium tabular-nums">{formatCents(d.totalAmountCents)}</p>
                  <p className="text-xs text-muted-foreground">incl. {formatCents(d.shippingCents)} shipping</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <OrderStatusBadge status={d.status} />
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={d.stripePaymentId}>
                    {d.stripePaymentId}
                  </p>
                </div>
              </div>

              {d.vendorOrders.map((vo) => {
                const refundable = !vo.refundedAt && !vo.payout && !["REFUNDED", "CANCELLED"].includes(vo.status)
                return (
                  <div key={vo.id} className="rounded-lg border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Link href={`/vendors/${vo.vendor.id}`} target="_blank" className="text-sm font-medium hover:underline">
                          {vo.vendor.storeName}
                        </Link>
                        <OrderStatusBadge status={vo.status} />
                      </div>
                      {refundable ? (
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setRefundTarget(vo)}>
                          <Undo2 /> Refund
                        </Button>
                      ) : vo.payout ? (
                        <span className="text-xs text-muted-foreground">Paid out — refund in Stripe</span>
                      ) : null}
                    </div>
                    <ul className="divide-y">
                      {vo.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          {item.product.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.product.images[0].url} alt="" className="size-8 rounded border object-cover" />
                          ) : (
                            <span className="flex size-8 items-center justify-center rounded bg-muted">
                              <Package className="size-3.5 text-muted-foreground" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {item.quantity} × {item.product.name}
                            {item.variant && <span className="text-muted-foreground"> ({item.variant.label})</span>}
                          </span>
                          <span className="tabular-nums">{formatCents(item.priceCents * item.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t px-3 py-2 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-muted-foreground">Merchandise</dt>
                        <dd className="tabular-nums">{formatCents(vo.subtotalCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Shipping</dt>
                        <dd className="tabular-nums">{formatCents(vo.shippingCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Commission</dt>
                        <dd className="tabular-nums">{formatCents(vo.commissionCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Farm earns</dt>
                        <dd className="tabular-nums">{formatCents(vo.payoutCents)}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
                      <span>{vo.shippingMethod ?? "No shipping method"}</span>
                      {vo.trackingNumber &&
                        (vo.trackingUrl ? (
                          <a href={vo.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                            {vo.trackingNumber} <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span>{vo.trackingNumber}</span>
                        ))}
                      {vo.payout && (
                        <span className="flex items-center gap-1">
                          Payout <StateBadge state={vo.payout.status} />
                        </span>
                      )}
                      {vo.refundedAt && <span>Refunded {formatDateTime(vo.refundedAt)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund {refundTarget?.vendor.storeName}&apos;s part of this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {refundTarget && formatCents(refundTarget.subtotalCents + refundTarget.shippingCents)} will be refunded to the customer through Stripe, stock will be restored and the farm will be notified. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refunding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void refund()
              }}
              disabled={refunding}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {refunding && <Loader2 className="animate-spin" />} Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={null}>
      <AdminOrders />
    </Suspense>
  )
}
