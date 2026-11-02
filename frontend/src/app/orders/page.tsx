"use client"

import Link from "next/link"
import { ArrowRight, Loader2, Package } from "lucide-react"
import { useApi } from "@/lib/api"
import { AccountShell, OrderStatusBadge } from "@/components/storefront/account"
import { SmartImage } from "@/components/storefront/smart-image"
import { formatCents, formatDate } from "@/lib/format"
import type { CustomerOrder } from "@/lib/customer-orders"

export default function OrdersPage() {
  const { data: orders, isLoading, error } = useApi<CustomerOrder[]>("/orders/my-orders")

  return (
    <AccountShell title="My orders" description="Every order, and each farm's part of it.">
      {isLoading || (!orders && !error) ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          We couldn&apos;t load your orders. Please refresh the page.
        </p>
      ) : !orders?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/60 px-6 py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.25} />
          <h2 className="mt-4 font-serif text-2xl font-medium">No orders yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">You haven&apos;t placed any orders yet.</p>
          <Link
            href="/products"
            className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => {
            const items = order.vendorOrders.flatMap((vo) => vo.items)
            const units = items.reduce((n, i) => n + i.quantity, 0)
            return (
              <li key={order.id} className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-5 py-3.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="font-semibold">Order #{order.id.slice(0, 8).toUpperCase()}</span>
                    <span className="text-muted-foreground">Placed {formatDate(order.createdAt)}</span>
                    <span className="font-semibold tabular-nums">{formatCents(order.totalAmountCents)}</span>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <ul className="flex shrink-0 -space-x-3" aria-hidden="true">
                      {items.slice(0, 4).map((item) => (
                        <li key={item.id} className="relative h-14 w-14 overflow-hidden rounded-md border-2 border-card bg-secondary">
                          <SmartImage src={item.product.images[0]?.url} alt="" sizes="56px" />
                        </li>
                      ))}
                    </ul>
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">
                        {items.slice(0, 2).map((i) => i.product.name).join(", ")}
                        {items.length > 2 && ` and ${items.length - 2} more`}
                      </p>
                      <p className="mt-0.5 truncate text-muted-foreground">
                        {units} {units === 1 ? "item" : "items"} from{" "}
                        {order.vendorOrders.map((vo) => vo.vendor.storeName).join(", ")}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/orders/${order.id}`}
                    className="group inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-semibold hover:bg-secondary"
                  >
                    View order
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </AccountShell>
  )
}
