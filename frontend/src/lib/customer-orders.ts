"use client"

import { useState } from "react"
import toast from "react-hot-toast"
import { useCartStore } from "@/store/use-cart-store"
import { effectivePrice, maxUnits } from "@/lib/product-pricing"
import { API_URL } from "@/lib/storefront"

export interface CustomerOrderItem {
  id: string
  quantity: number
  priceCents: number
  product: { id: string; name: string; images: { url: string }[] }
  variant: { id: string; label: string } | null
}

export interface CustomerVendorOrder {
  id: string
  status: string
  subtotalCents: number
  shippingCents: number
  shippingMethod: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  vendor: { id: string; storeName: string; photo: string | null }
  items: CustomerOrderItem[]
}

export interface CustomerOrder {
  id: string
  totalAmountCents: number
  shippingCents: number
  status: string
  createdAt: string
  shippingName: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingState: string | null
  shippingZip: string | null
  shippingPhone: string | null
  vendorOrders: CustomerVendorOrder[]
}

interface LiveProduct {
  id: string
  name: string
  isActive: boolean
  stockAmount: number
  discountName: string | null
  discountCents: number | null
  discountEndsAt: string | null
  images: { url: string }[]
  variants: { id: string; label: string; unitAmount: number; priceCents: number; isActive: boolean }[]
  vendor: { id: string; storeName: string; isApproved?: boolean; isSuspended?: boolean }
}

/**
 * "Buy again": re-adds an order's items at today's price, as far as each
 * product is still listed and in stock, and says what couldn't be added.
 */
export function useReorder() {
  const addItem = useCartStore((s) => s.addItem)
  const [busy, setBusy] = useState(false)

  async function reorder(order: CustomerOrder) {
    setBusy(true)
    const lines = order.vendorOrders.flatMap((vo) => vo.items)
    const ids = [...new Set(lines.map((l) => l.product.id))]
    const products = new Map<string, LiveProduct | null>()
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`${API_URL}/products/${id}`, { cache: "no-store" })
          products.set(id, res.ok ? await res.json() : null)
        } catch {
          products.set(id, null)
        }
      })
    )

    let added = 0
    const skipped: string[] = []
    for (const line of lines) {
      const product = products.get(line.product.id)
      const variant = product?.variants.find((v) => v.id === line.variant?.id && v.isActive)
      const listed = product?.isActive && product.vendor.isApproved !== false && product.vendor.isSuspended !== true
      const available = product && variant ? maxUnits(product.stockAmount, variant.unitAmount) : 0
      if (!product || !variant || !listed || available < 1) {
        skipped.push(line.product.name)
        continue
      }
      addItem({
        id: `${product.id}-${variant.id}`,
        productId: product.id,
        variantId: variant.id,
        variantLabel: variant.label,
        name: product.name,
        priceCents: effectivePrice(product, variant.priceCents),
        quantity: Math.min(line.quantity, available),
        vendorId: product.vendor.id,
        vendorName: product.vendor.storeName,
        image: product.images[0]?.url,
        stockAmount: product.stockAmount,
        unitAmount: variant.unitAmount,
      })
      added++
    }
    setBusy(false)

    if (added) toast.success(`Added ${added} ${added === 1 ? "item" : "items"} to your cart at today's prices`)
    if (skipped.length) toast.error(`No longer available: ${skipped.join(", ")}`)
    return added
  }

  return { reorder, busy }
}
