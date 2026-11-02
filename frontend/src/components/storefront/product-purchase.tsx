"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Minus, Plus, ShoppingBag } from "lucide-react"
import toast from "react-hot-toast"
import { useCartStore } from "@/store/use-cart-store"
import { effectivePrice, hasActiveDiscount, maxUnits } from "@/lib/product-pricing"
import { formatBaseUnits, formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"

interface PurchaseVariant {
  id: string
  label: string
  unitAmount: number
  priceCents: number
  isActive: boolean
}

export interface PurchaseProduct {
  id: string
  name: string
  baseUnit: string
  stockAmount: number
  isActive: boolean
  discountName: string | null
  discountCents: number | null
  discountEndsAt: string | null
  variants: PurchaseVariant[]
  images: { url: string }[]
  vendor: { id: string; storeName: string }
}

const LOW_STOCK_UNITS = 5

export function ProductPurchase({ product }: { product: PurchaseProduct }) {
  const addItem = useCartStore((s) => s.addItem)
  const activeVariants = product.variants.filter((v) => v.isActive)
  const [selectedId, setSelectedId] = useState(activeVariants[0]?.id)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const selected = activeVariants.find((v) => v.id === selectedId) ?? null
  const discounted = hasActiveDiscount(product)
  // Stock is shared across variants, so a variant is only purchasable when
  // at least one whole unit of it is left.
  const selectedMaxQty = selected ? maxUnits(product.stockAmount, selected.unitAmount) : 0
  const canPurchase = product.isActive && selectedMaxQty >= 1
  const unitPrice = selected ? effectivePrice(product, selected.priceCents) : 0

  function choose(variant: PurchaseVariant) {
    setSelectedId(variant.id)
    setQuantity(1)
  }

  function handleAddToCart() {
    if (!selected || !canPurchase) return
    const inCart = useCartStore.getState().items.find((i) => i.variantId === selected.id)?.quantity ?? 0
    if (inCart >= selectedMaxQty) {
      toast.error("Your cart already holds all the stock left of this item")
      return
    }
    addItem({
      id: `${product.id}-${selected.id}`,
      productId: product.id,
      variantId: selected.id,
      variantLabel: selected.label,
      name: product.name,
      priceCents: unitPrice,
      quantity,
      vendorId: product.vendor.id,
      vendorName: product.vendor.storeName,
      image: product.images[0]?.url,
      stockAmount: product.stockAmount,
      unitAmount: selected.unitAmount,
    })
    toast.success(`${product.name} added to cart!`)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div>
      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn("font-serif text-[2.25rem] font-medium leading-none tabular-nums", discounted && "text-terracotta")}>
          {selected ? formatCents(unitPrice) : "—"}
        </span>
        {discounted && selected && (
          <span className="text-lg text-muted-foreground line-through tabular-nums">{formatCents(selected.priceCents)}</span>
        )}
      </div>
      {selected && (
        <p className="mt-2 text-sm text-muted-foreground">
          {selected.label} · {formatBaseUnits(selected.unitAmount, product.baseUnit)}
        </p>
      )}
      {discounted && product.discountCents && (
        <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-md bg-terracotta/10 px-3 py-1.5 text-sm">
          <span className="font-semibold text-terracotta">{product.discountName}</span>
          <span className="text-foreground/80">
            Save {formatCents(product.discountCents)} on every size
            {product.discountEndsAt && (
              <span className="text-muted-foreground">
                {" "}
                until {new Date(product.discountEndsAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              </span>
            )}
          </span>
        </p>
      )}

      {/* Variants */}
      {activeVariants.length > 1 && (
        <fieldset className="mt-7">
          <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]">Size</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {activeVariants.map((variant) => {
              const available = maxUnits(product.stockAmount, variant.unitAmount) >= 1
              const isSelected = variant.id === selected?.id
              const price = formatCents(effectivePrice(product, variant.priceCents))
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => choose(variant)}
                  aria-pressed={isSelected}
                  aria-label={`${variant.label} — ${price}${available ? "" : " (sold out)"}`}
                  className={cn(
                    "flex min-h-14 flex-col items-start justify-center rounded-md border px-3 py-2 text-left transition-colors",
                    isSelected ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "bg-card hover:border-foreground/40",
                    !available && "text-muted-foreground"
                  )}
                >
                  <span className={cn("text-sm font-semibold", !available && "line-through decoration-1")}>{variant.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{available ? price : "Sold out"}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* Stock */}
      <p className="mt-6 flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 rounded-full",
            !product.isActive || !canPurchase ? "bg-destructive" : selectedMaxQty <= LOW_STOCK_UNITS ? "bg-terracotta" : "bg-good"
          )}
        />
        {!product.isActive ? (
          <span className="text-destructive">Currently unavailable</span>
        ) : canPurchase ? (
          <span>
            In stock
            <span className="ml-1.5 font-normal text-muted-foreground">
              {selectedMaxQty <= LOW_STOCK_UNITS ? `· Only ${selectedMaxQty} left` : `· ${selectedMaxQty} available`}
            </span>
          </span>
        ) : (
          <span className="text-destructive">Out of stock</span>
        )}
      </p>

      {/* Quantity + add */}
      <div className="mt-4 flex gap-3">
        <div className="flex h-12 shrink-0 items-center rounded-md border bg-card">
          <button
            type="button"
            className="flex h-12 w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || !canPurchase}
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite" aria-label={`Quantity ${quantity}`}>
            {quantity}
          </span>
          <button
            type="button"
            className="flex h-12 w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.min(q + 1, selectedMaxQty))}
            disabled={quantity >= selectedMaxQty}
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!selected || !canPurchase}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {added ? (
            <>
              <Check className="h-4 w-4" />
              Added to Cart
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" />
              Add to Cart
              {selected && canPurchase && <span className="tabular-nums">· {formatCents(unitPrice * quantity)}</span>}
            </>
          )}
        </button>
      </div>
      {added && (
        <p className="mt-3 text-sm">
          <Link href="/cart" className="font-semibold text-primary hover:underline">
            View cart
          </Link>
          <span className="text-muted-foreground"> or keep shopping.</span>
        </p>
      )}
    </div>
  )
}
