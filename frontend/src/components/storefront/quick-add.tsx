"use client"

import { useState } from "react"
import { Check, Plus } from "lucide-react"
import toast from "react-hot-toast"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCartStore } from "@/store/use-cart-store"
import { effectivePrice, hasActiveDiscount, maxUnits } from "@/lib/product-pricing"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogVariant } from "@/lib/storefront"

interface QuickAddProduct {
  id: string
  name: string
  stockAmount: number
  discountName?: string | null
  discountCents?: number | null
  discountEndsAt?: string | null
  variants: CatalogVariant[]
  images?: { url: string }[]
  vendor: { id: string; storeName: string }
}

/**
 * Card-level add to cart. A single purchasable variant is added straight
 * away; several open a compact picker. Stock is shared across variants, so
 * each variant is only offered while a whole unit of it is left.
 */
export function QuickAdd({ product }: { product: QuickAddProduct }) {
  const addItem = useCartStore((s) => s.addItem)
  const [open, setOpen] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  const variants = product.variants.filter((v) => v.isActive)
  const purchasable = variants.filter((v) => maxUnits(product.stockAmount, v.unitAmount) >= 1)
  const discounted = hasActiveDiscount(product)

  function add(variant: (typeof variants)[number]) {
    const inCart = useCartStore.getState().items.find((i) => i.variantId === variant.id)?.quantity ?? 0
    if (inCart >= maxUnits(product.stockAmount, variant.unitAmount)) {
      toast.error("Your cart already holds all the stock left of this item")
      setOpen(false)
      return
    }
    addItem({
      id: `${product.id}-${variant.id}`,
      productId: product.id,
      variantId: variant.id,
      variantLabel: variant.label,
      name: product.name,
      priceCents: effectivePrice(product, variant.priceCents),
      quantity: 1,
      vendorId: product.vendor.id,
      vendorName: product.vendor.storeName,
      image: product.images?.[0]?.url,
      stockAmount: product.stockAmount,
      unitAmount: variant.unitAmount,
    })
    toast.success(`${product.name} added to cart!`)
    setOpen(false)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1600)
  }

  const buttonClass =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-background px-3.5 text-[13px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:border-border disabled:text-muted-foreground"

  if (purchasable.length === 0) {
    return (
      <button type="button" className={buttonClass} disabled>
        Sold out
      </button>
    )
  }

  if (variants.length === 1) {
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => add(variants[0])}
        aria-label={`Add ${product.name} (${variants[0].label}) to cart`}
      >
        {justAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {justAdded ? "Added" : "Add"}
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={buttonClass} aria-label={`Choose a size of ${product.name}`}>
          {justAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {justAdded ? "Added" : "Add"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Choose a size
        </p>
        <ul className="space-y-0.5">
          {variants.map((variant) => {
            const available = maxUnits(product.stockAmount, variant.unitAmount) >= 1
            return (
              <li key={variant.id}>
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => add(variant)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    available ? "hover:bg-secondary" : "cursor-not-allowed opacity-50"
                  )}
                >
                  <span className="min-w-0 truncate font-medium">{variant.label}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    {available ? (
                      <>
                        {formatCents(effectivePrice(product, variant.priceCents))}
                        {discounted && (
                          <span className="ml-1.5 text-xs text-muted-foreground line-through">
                            {formatCents(variant.priceCents)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs">Sold out</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
