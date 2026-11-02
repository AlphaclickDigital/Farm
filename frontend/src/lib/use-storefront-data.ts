"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import toast from "react-hot-toast"
import { useCartStore } from "@/store/use-cart-store"
import { effectivePrice, maxUnits } from "@/lib/product-pricing"
import { API_URL, type FarmsResponse, type ShippingOptionPublic } from "@/lib/storefront"

/** Public farm directory keyed by id (names and photos for cart grouping). */
export function useFarmDirectory() {
  return useQuery({
    queryKey: ["storefront", "farms"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/storefront/farms`)
      if (!res.ok) throw new Error("Failed to load farms")
      const data: FarmsResponse = await res.json()
      return new Map(data.items.map((f) => [f.id, f]))
    },
    staleTime: 5 * 60_000,
  })
}

/** A farm's active delivery/pickup options. */
export function useShippingOptions(vendorId: string) {
  return useQuery({
    queryKey: ["storefront", "shipping", vendorId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/vendors/${vendorId}/shipping`)
      if (!res.ok) throw new Error("Failed to load delivery options")
      return (await res.json()) as ShippingOptionPublic[]
    },
    staleTime: 5 * 60_000,
  })
}

interface LiveProduct {
  isActive: boolean
  stockAmount: number
  discountName: string | null
  discountCents: number | null
  discountEndsAt: string | null
  images: { url: string }[]
  variants: { id: string; priceCents: number; unitAmount: number; isActive: boolean }[]
  vendor: { storeName: string; isApproved?: boolean; isSuspended?: boolean }
}

/**
 * Re-checks every cart line against live product data once per mount:
 * refreshes stock and price (checkout rejects stale prices), clamps
 * quantities, and flags lines whose product/variant is gone or sold out.
 */
export function useCartSync() {
  const syncItem = useCartStore((s) => s.syncItem)
  // Nothing to check for an empty cart, so only start "syncing" with items.
  const [syncing, setSyncing] = useState(() => useCartStore.getState().items.length > 0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const items = useCartStore.getState().items
    const productIds = [...new Set(items.map((i) => i.productId))]
    if (!productIds.length) return

    Promise.all(
      productIds.map(async (id) => {
        try {
          const res = await fetch(`${API_URL}/products/${id}`, { cache: "no-store" })
          return [id, res.ok ? ((await res.json()) as LiveProduct) : null] as const
        } catch {
          return [id, undefined] as const // network error: leave the line as it was
        }
      })
    )
      .then((results) => {
        const live = new Map(results)
        const repriced: string[] = []
        for (const item of useCartStore.getState().items) {
          const product = live.get(item.productId)
          if (product === undefined) continue
          const variant = product?.variants.find((v) => v.id === item.variantId)
          const listed =
            !!product &&
            product.isActive &&
            product.vendor.isApproved !== false &&
            product.vendor.isSuspended !== true &&
            !!variant?.isActive
          if (!product || !variant || !listed) {
            syncItem(item.id, { stockAmount: item.stockAmount, priceCents: item.priceCents, unavailable: true })
            continue
          }
          const priceCents = effectivePrice(product, variant.priceCents)
          if (priceCents !== item.priceCents) repriced.push(item.name)
          syncItem(item.id, {
            stockAmount: product.stockAmount,
            priceCents,
            unavailable: maxUnits(product.stockAmount, variant.unitAmount) < 1,
            vendorName: product.vendor.storeName,
            image: product.images[0]?.url ?? item.image,
          })
        }
        if (repriced.length) {
          toast(`Updated to the current price: ${repriced.join(", ")}`, { icon: "ℹ️" })
        }
      })
      .finally(() => setSyncing(false))
  }, [syncItem])

  return { syncing }
}
