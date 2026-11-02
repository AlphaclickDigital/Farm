import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

export type RangePreset = "today" | "7d" | "30d" | "90d" | "ytd" | "12m" | "custom"

export const RANGE_OPTIONS: { value: RangePreset; label: string; compare: string }[] = [
  { value: "today", label: "Today", compare: "same time yesterday" },
  { value: "7d", label: "Last 7 days", compare: "previous 7 days" },
  { value: "30d", label: "Last 30 days", compare: "previous 30 days" },
  { value: "90d", label: "Last 90 days", compare: "previous 90 days" },
  { value: "ytd", label: "This year", compare: "previous period" },
  { value: "12m", label: "Last 12 months", compare: "previous 12 months" },
  { value: "custom", label: "Custom range", compare: "previous period" },
]

interface DashboardRangeState {
  range: RangePreset
  from?: string
  to?: string
  setPreset: (range: Exclude<RangePreset, "custom">) => void
  setCustom: (from: string, to: string) => void
}

// One date range shared by every dashboard page, so switching pages keeps
// the period the user was looking at. Persisted per browser only.
export const useDashboardRange = create<DashboardRangeState>()(
  persist(
    (set) => ({
      range: "30d",
      setPreset: (range) => set({ range, from: undefined, to: undefined }),
      setCustom: (from, to) => set({ range: "custom", from, to }),
    }),
    // Rehydrated by DashboardShell after mount, so the server-rendered HTML
    // (which can't see localStorage) matches the first client render.
    { name: "farm-dashboard-range", skipHydration: true },
  ),
)

/** Query params for the backend's RangeQueryDto. */
export function useRangeParams() {
  const { range, from, to } = useDashboardRange()
  return range === "custom" && from && to ? { range, from, to } : { range: range === "custom" ? "30d" : range }
}

export function useCompareLabel() {
  const range = useDashboardRange((s) => s.range)
  return RANGE_OPTIONS.find((o) => o.value === range)?.compare ?? "previous period"
}

/** True once the persisted range has been read from localStorage. */
export function useRangeReady() {
  return useSyncExternalStore(
    (onChange) => useDashboardRange.persist.onFinishHydration(onChange),
    () => useDashboardRange.persist.hasHydrated(),
    () => false,
  )
}
