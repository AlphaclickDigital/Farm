"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCatalogNavigation } from "@/components/storefront/catalog-controls"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { FARM_SORTS } from "@/lib/storefront"
import { cn } from "@/lib/utils"

/**
 * A search box that writes `?q=` (debounced) through the catalog navigation
 * context, so results update as you type without a page jump.
 */
export function LiveSearchField({ placeholder, label, className }: { placeholder: string; label: string; className?: string }) {
  const searchParams = useSearchParams()
  const { navigate } = useCatalogNavigation()
  const urlValue = searchParams.get("q") ?? ""
  const [value, setValue] = useState(urlValue)
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue)
  const debounced = useDebouncedValue(value.trim(), 300)
  const lastSent = useRef(urlValue)

  // Follow back/forward navigation (adjusting state while rendering, as
  // React recommends, rather than in an effect).
  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue)
    if (urlValue !== value.trim()) setValue(urlValue)
  }

  useEffect(() => {
    if (debounced === lastSent.current || debounced === urlValue) {
      lastSent.current = debounced
      return
    }
    lastSent.current = debounced
    navigate({ q: debounced || null })
  }, [debounced, navigate, urlValue])

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-md border border-input bg-card pl-10 pr-10 text-sm outline-none focus:border-primary/60 focus:ring-[3px] focus:ring-ring/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function FarmSortSelect() {
  const searchParams = useSearchParams()
  const { navigate } = useCatalogNavigation()
  return (
    <Select
      value={searchParams.get("sort") ?? "recommended"}
      onValueChange={(value) => navigate({ sort: value === "recommended" ? null : value })}
    >
      <SelectTrigger className="h-10 w-full bg-card sm:w-[200px]" aria-label="Sort farms">
        <span className="text-muted-foreground">Sort:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {FARM_SORTS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
