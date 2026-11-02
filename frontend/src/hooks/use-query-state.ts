"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Reads and writes URL search params so filters survive reloads and can be
 * linked to (e.g. from ⌘K search or an insight's "view open orders" link).
 * Components using this must sit under a <Suspense> boundary.
 */
export function useQueryState() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams])

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key)
        else next.set(key, String(value))
      }
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return { get, set }
}
