"use client"

import { createContext, useContext, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontal, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Stars } from "@/components/storefront/rating"
import { SORT_OPTIONS, stateName, type CatalogFacets } from "@/lib/storefront"
import { cn } from "@/lib/utils"

// ───── Navigation state ─────

type Updates = Record<string, string | null | undefined>

const CatalogNavContext = createContext<{ navigate: (updates: Updates) => void; pending: boolean }>({
  navigate: () => undefined,
  pending: false,
})

/**
 * Filter changes are URL changes (shareable, back-button friendly, server
 * rendered). Wrapping them in a transition keeps the current results on
 * screen, dimmed, until the new ones arrive.
 */
export function CatalogNavigation({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function navigate(updates: Updates) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined || value === "") next.delete(key)
      else next.set(key, value)
    }
    // Any filter change starts again from the first page.
    if (!("page" in updates)) next.delete("page")
    const query = next.toString().replace(/%2C/g, ",")
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  return <CatalogNavContext.Provider value={{ navigate, pending }}>{children}</CatalogNavContext.Provider>
}

export function useCatalogNavigation() {
  return useContext(CatalogNavContext)
}

export function PendingRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useCatalogNavigation()
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50", className)}>
      {children}
    </div>
  )
}

// ───── Helpers ─────

const csv = (value: string | null) => (value ? value.split(",").filter(Boolean) : [])

function useListParam(key: string) {
  const searchParams = useSearchParams()
  const { navigate } = useCatalogNavigation()
  const values = csv(searchParams.get(key))
  return {
    values,
    toggle(value: string) {
      const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
      navigate({ [key]: next.join(",") || null })
    },
  }
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b py-5 first:pt-0 last:border-b-0">
      <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">{title}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  )
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: React.ReactNode
  count?: number
  checked: boolean
  onChange: () => void
}) {
  const disabled = !checked && count === 0
  return (
    <label
      className={cn(
        "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-secondary/70",
        disabled && "cursor-default opacity-45 hover:bg-transparent"
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
    </label>
  )
}

function PriceFilter({
  initialMin,
  initialMax,
  bounds,
}: {
  initialMin: string
  initialMax: string
  bounds: CatalogFacets["price"]
}) {
  const { navigate } = useCatalogNavigation()
  const [min, setMin] = useState(initialMin)
  const [max, setMax] = useState(initialMax)

  function apply(e: React.FormEvent) {
    e.preventDefault()
    const clean = (v: string) => (v && Number(v) >= 0 ? String(Math.round(Number(v))) : null)
    let lo = clean(min)
    let hi = clean(max)
    if (lo && hi && Number(lo) > Number(hi)) [lo, hi] = [hi, lo]
    navigate({ min: lo, max: hi })
  }

  const inputClass =
    "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus:border-primary/60 focus:ring-[3px] focus:ring-ring/20"

  return (
    <>
      <form onSubmit={apply} className="flex items-end gap-2 px-1.5">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Min ($)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder={bounds ? String(Math.floor(bounds.min / 100)) : "0"}
            className={inputClass}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Max ($)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder={bounds ? String(Math.ceil(bounds.max / 100)) : "Any"}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-primary/30 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
        >
          Go
        </button>
      </form>
      <p className="px-1.5 pt-1 text-[11px] text-muted-foreground">Based on each product&apos;s lowest price.</p>
    </>
  )
}

// ───── Filters ─────

interface CatalogFiltersProps {
  facets: CatalogFacets
  /** Names for selected categories that currently have no matches. */
  categoryNames: Record<string, string>
  hide?: ("category" | "farm" | "state")[]
}

export function CatalogFilters({ facets, categoryNames, hide = [] }: CatalogFiltersProps) {
  const searchParams = useSearchParams()
  const { navigate } = useCatalogNavigation()
  const category = useListParam("category")
  const farm = useListParam("farm")
  const state = useListParam("state")
  const [showAllFarms, setShowAllFarms] = useState(false)

  // Keep selected values visible (so they can be unticked) even at zero matches.
  const withSelected = <T extends { count: number }>(list: T[], selected: string[], key: (t: T) => string, make: (v: string) => T) => [
    ...list,
    ...selected.filter((v) => !list.some((t) => key(t) === v)).map(make),
  ]

  const categories = withSelected(facets.categories, category.values, (c) => c.slug, (slug) => ({
    slug,
    name: categoryNames[slug] ?? slug,
    count: 0,
  }))
  const farms = withSelected(facets.farms, farm.values, (f) => f.id, (id) => ({ id, storeName: "Selected farm", count: 0 }))
  const states = withSelected(facets.states, state.values, (s) => s.code, (code) => ({ code, count: 0 }))
  const visibleFarms = showAllFarms ? farms : farms.slice(0, 6)
  const rating = searchParams.get("rating")

  return (
    <div className="text-sm">
      {!hide.includes("category") && categories.length > 0 && (
        <FilterGroup title="Category">
          {categories.map((c) => (
            <CheckRow
              key={c.slug}
              label={c.name}
              count={c.count}
              checked={category.values.includes(c.slug)}
              onChange={() => category.toggle(c.slug)}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Price">
        {/* Keyed by the URL so the fields reset when the price filter changes elsewhere. */}
        <PriceFilter
          key={`${searchParams.get("min") ?? ""}-${searchParams.get("max") ?? ""}`}
          initialMin={searchParams.get("min") ?? ""}
          initialMax={searchParams.get("max") ?? ""}
          bounds={facets.price}
        />
      </FilterGroup>

      {!hide.includes("farm") && farms.length > 0 && (
        <FilterGroup title="Farm">
          {visibleFarms.map((f) => (
            <CheckRow key={f.id} label={f.storeName} count={f.count} checked={farm.values.includes(f.id)} onChange={() => farm.toggle(f.id)} />
          ))}
          {farms.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllFarms((v) => !v)}
              className="px-1.5 pt-1 text-xs font-semibold text-primary hover:underline"
            >
              {showAllFarms ? "Show fewer" : `Show all ${farms.length} farms`}
            </button>
          )}
        </FilterGroup>
      )}

      {!hide.includes("state") && states.length > 0 && (
        <FilterGroup title="Farm location">
          {states.map((s) => (
            <CheckRow
              key={s.code}
              label={stateName(s.code)}
              count={s.count}
              checked={state.values.includes(s.code)}
              onChange={() => state.toggle(s.code)}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Customer rating">
        {([4, 3] as const).map((stars) => (
          <CheckRow
            key={stars}
            label={
              <span className="flex items-center gap-1.5">
                <Stars value={stars} className="text-[13px]" />& up
              </span>
            }
            count={facets.rating[stars]}
            checked={rating === String(stars)}
            onChange={() => navigate({ rating: rating === String(stars) ? null : String(stars) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="Availability & offers">
        <CheckRow
          label="In stock only"
          count={facets.inStock}
          checked={searchParams.get("stock") === "1"}
          onChange={() => navigate({ stock: searchParams.get("stock") === "1" ? null : "1" })}
        />
        <CheckRow
          label="On sale"
          count={facets.onSale}
          checked={searchParams.get("sale") === "1"}
          onChange={() => navigate({ sale: searchParams.get("sale") === "1" ? null : "1" })}
        />
        <CheckRow
          label="Featured listings"
          count={facets.featured}
          checked={searchParams.get("featured") === "1"}
          onChange={() => navigate({ featured: searchParams.get("featured") === "1" ? null : "1" })}
        />
      </FilterGroup>
    </div>
  )
}

// ───── Toolbar: count, chips, sort, mobile filters ─────

const FILTER_KEYS = ["category", "farm", "state", "min", "max", "rating", "stock", "sale", "featured"] as const

export function SortSelect({ className }: { className?: string }) {
  const searchParams = useSearchParams()
  const { navigate } = useCatalogNavigation()
  const sort = searchParams.get("sort") ?? "recommended"
  return (
    <Select value={sort} onValueChange={(value) => navigate({ sort: value === "recommended" ? null : value })}>
      <SelectTrigger className={cn("h-10 w-full bg-card sm:w-[210px]", className)} aria-label="Sort products">
        <span className="text-muted-foreground">Sort:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORT_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CatalogToolbar({
  total,
  facets,
  categoryNames,
  farmNames,
  hide = [],
  showSearchChip = true,
}: {
  total: number
  facets: CatalogFacets
  categoryNames: Record<string, string>
  farmNames: Record<string, string>
  hide?: ("category" | "farm" | "state")[]
  showSearchChip?: boolean
}) {
  const searchParams = useSearchParams()
  const { navigate } = useCatalogNavigation()
  const [open, setOpen] = useState(false)

  const chips: { key: string; label: string; remove: Updates }[] = []
  const q = searchParams.get("q")
  if (q && showSearchChip) chips.push({ key: "q", label: `“${q}”`, remove: { q: null } })
  for (const [param, names] of [
    ["category", categoryNames],
    ["farm", farmNames],
    ["state", null],
  ] as const) {
    if (hide.includes(param)) continue
    const values = csv(searchParams.get(param))
    for (const v of values) {
      chips.push({
        key: `${param}-${v}`,
        label: names ? (names[v] ?? v) : stateName(v),
        remove: { [param]: values.filter((x) => x !== v).join(",") || null },
      })
    }
  }
  const min = searchParams.get("min")
  const max = searchParams.get("max")
  if (min || max) {
    chips.push({ key: "price", label: min && max ? `$${min}–$${max}` : min ? `From $${min}` : `Up to $${max}`, remove: { min: null, max: null } })
  }
  const rating = searchParams.get("rating")
  if (rating) chips.push({ key: "rating", label: `${rating}★ & up`, remove: { rating: null } })
  if (searchParams.get("stock") === "1") chips.push({ key: "stock", label: "In stock", remove: { stock: null } })
  if (searchParams.get("sale") === "1") chips.push({ key: "sale", label: "On sale", remove: { sale: null } })
  if (searchParams.get("featured") === "1") chips.push({ key: "featured", label: "Featured", remove: { featured: null } })

  const filterCount = chips.filter((c) => c.key !== "q").length
  const clearAll = () =>
    navigate(Object.fromEntries(FILTER_KEYS.filter((k) => !hide.includes(k as never)).map((k) => [k, null])))

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-semibold text-foreground">{total}</span> {total === 1 ? "product" : "products"}
        </p>
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-3.5 text-sm font-semibold lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {filterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                    {filterCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 p-0">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="font-serif text-xl font-medium">Filters</SheetTitle>
                <SheetDescription className="text-xs">
                  {total} {total === 1 ? "product matches" : "products match"}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <CatalogFilters facets={facets} categoryNames={categoryNames} hide={hide} />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t px-5 py-4">
                <button type="button" onClick={clearAll} className="h-11 rounded-md border text-sm font-semibold">
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-11 rounded-md bg-primary text-sm font-semibold text-primary-foreground"
                >
                  Show {total} {total === 1 ? "result" : "results"}
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <SortSelect className="w-auto sm:w-[210px]" />
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => navigate(chip.remove)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card pl-3 pr-2 text-xs font-medium hover:border-foreground/40"
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
          {filterCount > 1 && (
            <li>
              <button type="button" onClick={clearAll} className="px-2 text-xs font-semibold text-primary hover:underline">
                Clear all
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
