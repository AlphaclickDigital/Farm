"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"

const SESSION_KEY = "farm-viewed-products"

/**
 * Records one anonymous product view per browser session for vendor
 * analytics (views and conversion rate). Vendors and admins browsing the
 * storefront are not counted. The server stores only daily totals per
 * product — no user, IP or device data.
 */
export function ProductViewTracker({ productId }: { productId: string }) {
  const { data: session, status } = useSession()
  const role = session?.user?.role

  useEffect(() => {
    if (status === "loading" || role === "VENDOR" || role === "ADMIN") return
    let seen: string[] = []
    try {
      seen = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]")
      if (seen.includes(productId)) return
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...seen, productId].slice(-200)))
    } catch {
      // Storage unavailable (private mode etc.): the server still dedupes.
    }
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/analytics/track/product-view/${productId}`, {
      method: "POST",
      keepalive: true,
    }).catch(() => undefined)
  }, [productId, role, status])

  return null
}
