"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { ArrowRight, Loader2, MapPin, Package, Star, Store } from "lucide-react"
import { useApi } from "@/lib/api"
import { AccountShell, OrderStatusBadge } from "@/components/storefront/account"
import { SmartImage } from "@/components/storefront/smart-image"
import { Stars } from "@/components/storefront/rating"
import { formatCents, formatDate } from "@/lib/format"
import type { CustomerOrder, CustomerOrderItem } from "@/lib/customer-orders"

interface MyReview {
  id: string
  productId: string
  rating: number
  comment: string | null
}

function Panel({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-32 rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 id={id ? `${id}-title` : undefined} className="font-semibold">
          {title}
        </h2>
        {action}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

export default function AccountPage() {
  const { data: session } = useSession()
  const { data: orders, isLoading: ordersLoading } = useApi<CustomerOrder[]>("/orders/my-orders")
  const { data: reviews, isLoading: reviewsLoading } = useApi<MyReview[]>("/reviews/me")

  const firstName = session?.user?.name?.split(" ")[0]
  const recent = orders?.slice(0, 3) ?? []
  const lastAddress = orders?.find((o) => o.shippingName)

  // Products from completed farm orders, newest first, once each.
  const reviewed = new Set(reviews?.map((r) => r.productId))
  const products = new Map<string, CustomerOrderItem["product"]>()
  for (const order of orders ?? []) {
    for (const vo of order.vendorOrders) {
      for (const item of vo.items) products.set(item.product.id, item.product)
    }
  }
  const toReview: CustomerOrderItem["product"][] = []
  for (const order of orders ?? []) {
    for (const vo of order.vendorOrders) {
      if (vo.status !== "COMPLETED") continue
      for (const item of vo.items) {
        if (!reviewed.has(item.product.id) && !toReview.some((p) => p.id === item.product.id)) toReview.push(item.product)
      }
    }
  }
  const spent = (orders ?? [])
    .filter((o) => o.status !== "REFUNDED" && o.status !== "CANCELLED")
    .reduce((n, o) => n + o.totalAmountCents, 0)
  const farmsSupported = new Set((orders ?? []).flatMap((o) => o.vendorOrders.map((vo) => vo.vendor.id))).size

  const loading = ordersLoading || (!orders && !!session)

  return (
    <AccountShell
      title={firstName ? `Hi, ${firstName}` : "Your account"}
      description="Your orders, reviews and details in one place."
    >
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-3 divide-x rounded-lg border bg-card">
            {[
              { label: "Orders", value: String(orders?.length ?? 0) },
              { label: "Farms supported", value: String(farmsSupported) },
              { label: "Spent", value: formatCents(spent) },
            ].map((s) => (
              <div key={s.label} className="px-4 py-4 sm:px-6">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="mt-1 font-serif text-xl font-medium tabular-nums sm:text-2xl">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { href: "/products", label: "Shop the market", icon: Package },
              { href: "/vendors", label: "Discover farms", icon: Store },
              { href: "/orders", label: "Track an order", icon: MapPin },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3.5 text-sm font-semibold hover:border-foreground/30"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-olive" />
                  {label}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>

          <Panel
            title="Recent orders"
            action={
              orders && orders.length > 0 ? (
                <Link href="/orders" className="text-sm font-semibold text-primary hover:underline">
                  View all
                </Link>
              ) : undefined
            }
          >
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No orders yet.{" "}
                <Link href="/products" className="font-semibold text-primary hover:underline">
                  Start shopping
                </Link>
              </p>
            ) : (
              <ul className="-my-3 divide-y">
                {recent.map((order) => (
                  <li key={order.id}>
                    <Link href={`/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-primary">
                      <span className="text-sm">
                        <span className="font-semibold">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatDate(order.createdAt)} · {order.vendorOrders.length}{" "}
                          {order.vendorOrders.length === 1 ? "farm" : "farms"}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">{formatCents(order.totalAmountCents)}</span>
                        <OrderStatusBadge status={order.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="reviews" title="Reviews">
            {toReview.length > 0 && (
              <div className="mb-6">
                <p className="mb-3 text-sm font-semibold">Ready for your review</p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {toReview.slice(0, 6).map((product) => (
                    <li key={product.id}>
                      <Link
                        href={`/products/${product.id}#reviews`}
                        className="flex items-center gap-3 rounded-md border px-3 py-2.5 hover:border-foreground/30"
                      >
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-secondary">
                          <SmartImage src={product.images[0]?.url} alt="" sizes="44px" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                          <Star className="h-3.5 w-3.5" />
                          Review
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mb-3 text-sm font-semibold">Your reviews</p>
            {reviewsLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : !reviews?.length ? (
              <p className="text-sm text-muted-foreground">
                You haven&apos;t reviewed anything yet. Once a farm completes your order, you can review what you bought.
              </p>
            ) : (
              <ul className="divide-y border-y">
                {reviews.map((review) => {
                  const product = products.get(review.productId)
                  return (
                    <li key={review.id} className="flex gap-3 py-3.5">
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-secondary">
                        <SmartImage src={product?.images[0]?.url} alt="" sizes="44px" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/products/${review.productId}#reviews`} className="truncate text-sm font-semibold hover:text-primary">
                            {product?.name ?? "Product"}
                          </Link>
                          <Stars value={review.rating} className="text-sm" />
                        </div>
                        {review.comment && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{review.comment}</p>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Your details">
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="mt-0.5 font-medium">{session?.user?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="mt-0.5 break-all font-medium">{session?.user?.email}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Most recent delivery address</dt>
                <dd className="mt-0.5 leading-relaxed">
                  {lastAddress ? (
                    <>
                      {lastAddress.shippingName}, {lastAddress.shippingAddress}, {lastAddress.shippingCity}{" "}
                      {lastAddress.shippingState} {lastAddress.shippingZip}
                      {lastAddress.shippingPhone && <span className="text-muted-foreground"> · {lastAddress.shippingPhone}</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">You&apos;ll enter an address at checkout.</span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-muted-foreground">
              Forgotten your password?{" "}
              <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
                Reset it here
              </Link>
              .
            </p>
          </Panel>
        </div>
      )}
    </AccountShell>
  )
}
