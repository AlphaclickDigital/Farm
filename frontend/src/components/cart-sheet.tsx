"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShoppingBag } from "lucide-react"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { groupByFarm, useCartStore } from "@/store/use-cart-store"
import { CartItemRow } from "@/components/cart-item-row"
import { useFarmDirectory } from "@/lib/use-storefront-data"
import { useHydrated } from "@/lib/use-local-storage"
import { formatCents } from "@/lib/format"

export function CartSheet() {
  const mounted = useHydrated()
  const [open, setOpen] = useState(false)

  const items = useCartStore((s) => s.items)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const { data: farms } = useFarmDirectory()
  // Quantities are locked during checkout: the payment amount is fixed once
  // the PaymentIntent exists, so the cart must not change underneath it.
  const locked = usePathname() === "/checkout"

  const totalItems = mounted ? items.reduce((n, i) => n + i.quantity, 0) : 0
  const totalPrice = items.reduce((n, i) => n + i.priceCents * i.quantity, 0)
  const groups = groupByFarm(items)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="relative flex h-11 items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold outline-none transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label={`Cart, ${totalItems} ${totalItems === 1 ? "item" : "items"}`}
        >
          <ShoppingBag className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">Cart</span>
          {totalItems > 0 && (
            <span className="absolute right-0.5 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold leading-none text-terracotta-foreground sm:static sm:h-5 sm:min-w-5">
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-serif text-xl font-medium">
            Your cart{totalItems > 0 && <span className="ml-1.5 text-muted-foreground">({totalItems})</span>}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {groups.length > 1
              ? `From ${groups.length} farms — each packs and delivers its own items.`
              : "Fresh from independent Australian farms."}
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.25} />
            <div>
              <p className="font-serif text-lg font-medium">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">Fill it with something good from a local farm.</p>
            </div>
            <SheetClose asChild>
              <Link
                href="/products"
                className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Start shopping
              </Link>
            </SheetClose>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {groups.map((group) => (
                <section key={group.vendorId} className="border-b px-5 py-4 last:border-b-0">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <SheetClose asChild>
                      <Link href={`/vendors/${group.vendorId}`} className="truncate text-xs font-bold uppercase tracking-[0.12em] text-olive hover:underline">
                        {group.vendorName ?? farms?.get(group.vendorId)?.storeName ?? "Farm"}
                      </Link>
                    </SheetClose>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatCents(group.subtotalCents)}</span>
                  </div>
                  <div className="space-y-4">
                    {group.items.map((item) => (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeItem}
                        compact
                        readOnly={locked}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="space-y-3 border-t bg-card px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-lg font-bold tabular-nums">{formatCents(totalPrice)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Delivery is charged per farm and calculated at checkout.</p>
              <div className="grid grid-cols-2 gap-2">
                <SheetClose asChild>
                  <Link href="/cart" className="inline-flex h-11 items-center justify-center rounded-md border bg-background text-sm font-semibold hover:bg-secondary">
                    View cart
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/checkout"
                    className="inline-flex h-11 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Checkout
                  </Link>
                </SheetClose>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
