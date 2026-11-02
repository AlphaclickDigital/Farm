"use client"

import { qs, useApi } from "@/lib/api"
import { useRangeParams, useRangeReady } from "@/store/use-dashboard-range"

/**
 * GET an analytics endpoint for the dashboard's current date range. Waits
 * for the persisted range to load so the first request already uses it.
 */
export function useAnalytics<T>(
  path: string | null,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  const range = useRangeParams()
  const ready = useRangeReady()
  return useApi<T>(path && ready ? `${path}${qs({ ...range, ...extra })}` : null)
}
