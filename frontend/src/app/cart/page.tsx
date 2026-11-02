"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { ArrowLeft, Info, Loader2, Lock, ShoppingBag } from "lucide-react"
import { groupByFarm, useCartStore, type CartItem } from "@/store/use-cart-store"
import { CartItemRow } from "@/components/cart-item-row"
import { SmartImage } from "@/components/storefront/smart-image"
import { useCartSync, useFarmDirectory, useShippingOptions } from "@/lib/use-storefront-data"
import { useHydrated } from "@/lib/use-local-storage"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"

function FreeDeliveryNote({ vendorId, subtotalCents }: { vendorId: string; subtotalCents: number }) {
  const { data: options } = useShippingOptions(vendorId)
  if (!options?.length) return null

  const pickup = options.some((o) => o.type === "PICKUP")
  const thresholds = options
    .filter((o) => o.type !== "PICKUP" && o.minOrderCents)
    .map((o) => o.minOrderCents!)
  const threshold = thresholds.length ? Math.min(...thresholds) : null

  if (!threshold) {
    return pickup ? <p className="text-xs text-muted-foreground">Pickup available from this farm.</p> : null
  }
  const remaining = threshold - subtotalCents
  const pct = Math.min(100, Math.round((subtotalCents / threshold) * 100))
  return (
    <div className="space-y-1.5">
      <p className="text-xs">
        {remaining > 0 ? (
          <>
            Add <span className="font-semibold tabular-nums">{formatCents(remaining)}</span> more from this farm for free
            delivery.
          </>
        ) : (
          <span className="font-semibold text-olive">You&apos;ve unlocked free delivery from this farm.</span>
        )}
        {pickup && <span className="text-muted-foreground"> Pickup is also available.</span>}
      </p>
      <div className="h-1.5 max-w-xs overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <div className={cn("h-full rounded-full", remaining > 0 ? "bg-gold" : "bg-good")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function CartPage() {
  const mounted = useHydrated()
  const { status } = useSession()

  const items = useCartStore((s) => s.items)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const clearCart = useCartStore((s) => s.clearCart)
  const { syncing } = useCartSync()
  const { data: farms } = useFarmDirectory()

  if (!mounted) {
    return (
      <div className="shell flex min-h-[50vh] items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalItems = items.reduce((n, i) => n + i.quantity, 0)
  const totalPrice = items.reduce((n, i) => n + i.priceCents * i.quantity, 0)
  const groups = groupByFarm(items)
  const unavailable = items.filter((i) => i.unavailable)

  if (items.length === 0) {
    return (
      <div className="shell flex min-h-[60vh] flex-col items-center justify-center gap-5 py-16 text-center">
        <ShoppingBag className="h-14 w-14 text-muted-foreground/40" strokeWidth={1.25} />
        <div>
          <h1 className="font-serif text-3xl font-medium">Your cart is empty</h1>
          <p className="mt-2 text-muted-foreground">Looks like you haven&apos;t added any products yet.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/products"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Start shopping
          </Link>
          <Link href="/vendors" className="inline-flex h-11 items-center justify-center rounded-md border px-6 text-sm font-semibold hover:bg-secondary">
            Discover farms
          </Link>
        </div>
      </div>
    )
  }

  const farmName = (group: { vendorId: string; vendorName?: string }) =>
    group.vendorName ?? farms?.get(group.vendorId)?.storeName ?? "Farm"

  return (
    <div className="shell pb-24 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-medium tracking-[-0.02em]">Your cart</h1>
          <p className="mt-2 text-muted-foreground">
            {totalItems} {totalItems === 1 ? "item" : "items"} from {groups.length} {groups.length === 1 ? "farm" : "farms"}
          </p>
        </div>
        <button
          type="button"
          onClick={clearCart}
          className="text-sm font-medium text-muted-foreground hover:text-destructive hover:underline"
        >
          Clear cart
        </button>
      </div>

      {groups.length > 1 && (
        <p className="mt-6 flex items-start gap-2.5 rounded-md border bg-card px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-olive" />
          <span>
            Your order includes products from <strong>{groups.length} farms</strong>. Each farm packs and sends its own
            items, so you&apos;ll choose delivery or pickup for each farm at checkout.
          </span>
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {groups.map((group) => {
            const farm = farms?.get(group.vendorId)
            return (
              <section key={group.vendorId} aria-label={farmName(group)} className="overflow-hidden rounded-lg border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-5 py-3.5">
                  <Link href={`/vendors/${group.vendorId}`} className="group flex min-w-0 items-center gap-3">
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                      <SmartImage src={farm?.photo} alt="" sizes="36px" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold group-hover:underline">{farmName(group)}</span>
                      {farm?.state && (
                        <span className="block text-xs text-muted-foreground">
                          {[farm.location, farm.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                  </Link>
                  <span className="text-sm tabular-nums">
                    <span className="text-muted-foreground">Farm subtotal </span>
                    <span className="font-semibold">{formatCents(group.subtotalCents)}</span>
                  </span>
                </header>
                <ul className="divide-y">
                  {group.items.map((item: CartItem) => (
                    <li key={item.id} className="px-5 py-5">
                      <CartItemRow item={item} onUpdateQuantity={updateQuantity} onRemove={removeItem} />
                    </li>
                  ))}
                </ul>
                <div className="border-t px-5 py-3.5">
                  <FreeDeliveryNote vendorId={group.vendorId} subtotalCents={group.subtotalCents} />
                </div>
              </section>
            )
          })}

          <Link href="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Continue shopping
          </Link>
        </div>

        <aside className="lg:col-span-4">
          <div className="rounded-lg border bg-card p-6 lg:sticky lg:top-32" aria-label="Order summary">
            <h2 className="font-serif text-2xl font-medium">Order summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal ({totalItems} {totalItems === 1 ? "item" : "items"})
                </dt>
                <dd className="font-semibold tabular-nums">{formatCents(totalPrice)}</dd>
              </div>
              {groups.length > 1 && (
                <ul className="space-y-1.5 border-l-2 pl-3 text-xs text-muted-foreground">
                  {groups.map((g) => (
                    <li key={g.vendorId} className="flex justify-between gap-3">
                      <span className="truncate">{farmName(g)}</span>
                      <span className="tabular-nums">{formatCents(g.subtotalCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="text-right text-muted-foreground">Calculated at checkout</dd>
              </div>
              <div className="flex justify-between border-t pt-4 text-base">
                <dt className="font-semibold">Estimated total</dt>
                <dd className="font-bold tabular-nums">{formatCents(totalPrice)}</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted-foreground">Each farm&apos;s delivery or pickup is added at checkout.</p>

            {unavailable.length > 0 && (
              <p className="mt-5 rounded-md bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive" role="alert">
                {unavailable.length === 1 ? "One item is" : `${unavailable.length} items are`} no longer available. Remove{" "}
                {unavailable.length === 1 ? "it" : "them"} to continue.
              </p>
            )}

            <Link
              href={status === "authenticated" ? "/checkout" : "/login?callbackUrl=/checkout"}
              aria-disabled={unavailable.length > 0 || syncing}
              className={cn(
                "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
                (unavailable.length > 0 || syncing) && "pointer-events-none opacity-50"
              )}
            >
              {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === "authenticated" ? "Proceed to Checkout" : "Sign in to check out"}
            </Link>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Secure payment with Stripe
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
