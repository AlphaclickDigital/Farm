"use client"

import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, MapPin, RotateCcw, Star, Truck } from "lucide-react"
import { useApi } from "@/lib/api"
import { AccountShell, OrderProgress, OrderStatusBadge } from "@/components/storefront/account"
import { SmartImage } from "@/components/storefront/smart-image"
import { formatCents, formatDate } from "@/lib/format"
import { useReorder, type CustomerOrder } from "@/lib/customer-orders"

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSuccess = searchParams.get("success") === "true"
  const { data: order, isLoading, error } = useApi<CustomerOrder>(`/orders/my-orders/${params.id}`)
  const { reorder, busy } = useReorder()

  if (isLoading || (!order && !error)) {
    return (
      <AccountShell title="Order">
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AccountShell>
    )
  }

  if (!order) {
    return (
      <AccountShell title="Order not found">
        <p className="text-muted-foreground">
          We couldn&apos;t find this order on your account.{" "}
          <Link href="/orders" className="font-semibold text-primary hover:underline">
            Back to your orders
          </Link>
        </p>
      </AccountShell>
    )
  }

  const productSubtotal = order.vendorOrders.reduce((n, vo) => n + vo.subtotalCents, 0)

  return (
    <AccountShell
      title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
      description={
        <span className="flex flex-wrap items-center gap-3">
          Placed on {formatDate(order.createdAt)}
          <OrderStatusBadge status={order.status} />
        </span>
      }
    >
      {isSuccess && (
        <div className="mb-8 flex gap-3 rounded-lg border border-good/30 bg-good/10 px-5 py-4" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-good" />
          <div>
            <p className="font-semibold">Order placed successfully!</p>
            <p className="mt-0.5 text-sm text-foreground/80">
              Thank you for your purchase. You&apos;ll receive an email confirmation shortly, and each farm will let you
              know as your order moves along.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          {order.vendorOrders.map((vendorOrder) => (
            <section key={vendorOrder.id} className="rounded-lg border bg-card" aria-label={vendorOrder.vendor.storeName}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <Link href={`/vendors/${vendorOrder.vendor.id}`} className="group flex items-center gap-3">
                  <span className="relative h-9 w-9 overflow-hidden rounded-full bg-secondary">
                    <SmartImage src={vendorOrder.vendor.photo} alt="" sizes="36px" />
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground">Sent by</span>
                    <span className="block font-semibold group-hover:underline">{vendorOrder.vendor.storeName}</span>
                  </span>
                </Link>
                <OrderStatusBadge status={vendorOrder.status} />
              </header>

              <div className="space-y-5 px-5 py-5">
                <OrderProgress status={vendorOrder.status} />

                <ul className="divide-y">
                  {vendorOrder.items.map((item) => (
                    <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                      <Link
                        href={`/products/${item.product.id}`}
                        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <SmartImage src={item.product.images[0]?.url} alt="" sizes="64px" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/products/${item.product.id}`} className="font-medium hover:text-primary">
                          {item.product.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {item.variant?.label && <>{item.variant.label} · </>}
                          Qty: {item.quantity} × {formatCents(item.priceCents)}
                        </p>
                        {vendorOrder.status === "COMPLETED" && (
                          <Link
                            href={`/products/${item.product.id}#reviews`}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                          >
                            <Star className="h-3.5 w-3.5" />
                            Rate Product
                          </Link>
                        )}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">{formatCents(item.priceCents * item.quantity)}</p>
                    </li>
                  ))}
                </ul>

                <dl className="space-y-1.5 border-t pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="tabular-nums">{formatCents(vendorOrder.subtotalCents)}</dd>
                  </div>
                  {vendorOrder.shippingMethod && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Delivery ({vendorOrder.shippingMethod})</dt>
                      <dd className="tabular-nums">
                        {vendorOrder.shippingCents > 0 ? formatCents(vendorOrder.shippingCents) : <span className="text-olive">FREE</span>}
                      </dd>
                    </div>
                  )}
                </dl>

                {vendorOrder.trackingNumber && (
                  <div className="flex items-center gap-3 rounded-md bg-info/10 px-4 py-3">
                    <Truck className="h-4 w-4 shrink-0 text-info" />
                    <p className="min-w-0 flex-1 text-sm">
                      <span className="text-muted-foreground">Tracking: </span>
                      <span className="font-semibold">{vendorOrder.trackingNumber}</span>
                    </p>
                    {vendorOrder.trackingUrl && (
                      <a
                        href={vendorOrder.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-info hover:underline"
                      >
                        Track
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-5 xl:col-span-4">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">Payment summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Products</dt>
                <dd className="tabular-nums">{formatCents(productSubtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="tabular-nums">{order.shippingCents > 0 ? formatCents(order.shippingCents) : "FREE"}</dd>
              </div>
              <div className="flex justify-between border-t pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCents(order.totalAmountCents)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Paid by card via Stripe.</p>
          </div>

          {order.shippingName && (
            <div className="rounded-lg border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4 text-olive" />
                Delivery address
              </h2>
              <address className="mt-3 text-sm not-italic leading-relaxed text-muted-foreground">
                <span className="block text-foreground">{order.shippingName}</span>
                {order.shippingAddress}
                <br />
                {order.shippingCity}, {order.shippingState} {order.shippingZip}
                {order.shippingPhone && (
                  <>
                    <br />
                    {order.shippingPhone}
                  </>
                )}
              </address>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await reorder(order)) router.push("/cart")
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Buy again
          </button>
          <Link href="/orders" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />
            All orders
          </Link>
        </aside>
      </div>
    </AccountShell>
  )
}
