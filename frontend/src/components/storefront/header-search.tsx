"use client"

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowUpRight, Clock, Loader2, MapPin, Search, X } from "lucide-react"
import { SmartImage } from "@/components/storefront/smart-image"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { formatCents } from "@/lib/format"
import { API_URL, farmPlace, type SearchSuggestions } from "@/lib/storefront"
import { cn } from "@/lib/utils"
import { useStoredValue, writeStored } from "@/lib/use-local-storage"

const RECENT_KEY = "farm-recent-searches"
const MAX_RECENT = 6

interface HeaderSearchProps {
  popular: { name: string; slug: string }[]
  className?: string
}

type Option =
  | { kind: "recent"; label: string; href: string }
  | { kind: "category"; label: string; href: string }
  | { kind: "product"; label: string; href: string; item: SearchSuggestions["products"][number] }
  | { kind: "farm"; label: string; href: string; item: SearchSuggestions["farms"][number] }
  | { kind: "all"; label: string; href: string }

const NO_RECENT: string[] = []

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const index = text.toLowerCase().indexOf(q.toLowerCase())
  if (index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-bold text-foreground">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}

function SearchField({
  inputProps,
  onClear,
  showClear,
  busy,
}: {
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }
  onClear?: () => void
  showClear?: boolean
  busy?: boolean
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        placeholder="Search produce, meat, honey or farms"
        autoComplete="off"
        spellCheck={false}
        className="h-11 w-full rounded-full border border-input bg-card pl-11 pr-11 text-sm shadow-[inset_0_1px_2px_rgb(43_33_24/0.04)] outline-none transition-colors placeholder:text-muted-foreground/80 focus:border-primary/60 focus:ring-[3px] focus:ring-ring/20 [&::-webkit-search-cancel-button]:appearance-none"
        {...inputProps}
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : showClear ? (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </span>
    </div>
  )
}

function HeaderSearchInner({ popular, className }: HeaderSearchProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastPointer = useRef<string | null>(null)

  const urlQuery = pathname === "/products" ? (searchParams.get("q") ?? "") : ""
  const [query, setQuery] = useState(urlQuery)
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const recentStored = useStoredValue<string[]>(RECENT_KEY, NO_RECENT)
  const recent = useMemo(
    () => (Array.isArray(recentStored) ? recentStored.filter((r) => typeof r === "string").slice(0, MAX_RECENT) : NO_RECENT),
    [recentStored]
  )
  // `data` is null when the request failed, so the spinner still stops.
  const [results, setResults] = useState<{ q: string; data: SearchSuggestions | null } | null>(null)

  // Keep the field in step with the URL when navigating between searches.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery)
    setQuery(urlQuery)
  }

  const trimmed = query.trim()
  const debounced = useDebouncedValue(trimmed, 180)
  const loading = debounced.length >= 2 && results?.q !== debounced

  useEffect(() => {
    if (debounced.length < 2) return
    const controller = new AbortController()
    fetch(`${API_URL}/storefront/suggest?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SearchSuggestions | null) => setResults({ q: debounced, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResults({ q: debounced, data: null })
      })
    return () => controller.abort()
  }, [debounced])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const showResults = trimmed.length >= 2
  const data = showResults && results?.q === debounced ? results.data : null

  const options = useMemo<Option[]>(() => {
    if (!showResults) {
      return [
        ...recent.map((r) => ({ kind: "recent" as const, label: r, href: `/products?q=${encodeURIComponent(r)}` })),
        ...popular.slice(0, 6).map((c) => ({
          kind: "category" as const,
          label: c.name,
          href: `/products?category=${c.slug}`,
        })),
      ]
    }
    if (!data) return [{ kind: "all", label: trimmed, href: `/products?q=${encodeURIComponent(trimmed)}` }]
    return [
      ...data.categories.map((c) => ({ kind: "category" as const, label: c.name, href: `/products?category=${c.slug}` })),
      ...data.products.map((p) => ({ kind: "product" as const, label: p.name, href: `/products/${p.id}`, item: p })),
      ...data.farms.map((f) => ({ kind: "farm" as const, label: f.storeName, href: `/vendors/${f.id}`, item: f })),
      { kind: "all" as const, label: trimmed, href: `/products?q=${encodeURIComponent(trimmed)}` },
    ]
  }, [showResults, recent, popular, data, trimmed])

  // A new set of suggestions starts with nothing highlighted.
  const optionsKey = options.map((o) => o.href).join("|")
  const [seenOptionsKey, setSeenOptionsKey] = useState(optionsKey)
  if (optionsKey !== seenOptionsKey) {
    setSeenOptionsKey(optionsKey)
    setActive(-1)
  }

  function remember(term: string) {
    writeStored(RECENT_KEY, [term, ...recent.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT))
  }

  function go(option: Option) {
    if (option.kind === "all" || option.kind === "recent") remember(option.label)
    setOpen(false)
    inputRef.current?.blur()
    router.push(option.href)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (active >= 0 && options[active]) return go(options[active])
    if (!trimmed) return
    go({ kind: "all", label: trimmed, href: `/products?q=${encodeURIComponent(trimmed)}` })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setOpen(true)
      if (!options.length) return
      // -1 means "nothing highlighted" (Enter searches the typed text).
      if (e.key === "ArrowDown") setActive((i) => (i + 1 >= options.length ? -1 : i + 1))
      else setActive((i) => (i - 1 < -1 ? options.length - 1 : i - 1))
    } else if (e.key === "Escape") {
      setOpen(false)
      setActive(-1)
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`
  const indexOf = (o: Option) => options.indexOf(o)

  const optionClass = (o: Option) =>
    cn(
      "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
      indexOf(o) === active ? "bg-secondary" : "hover:bg-secondary/70"
    )

  const optionProps = (o: Option) => ({
    id: optionId(indexOf(o)),
    role: "option" as const,
    "aria-selected": indexOf(o) === active,
    // Highlight on real pointer movement only: suggestions re-rendering under
    // a resting cursor must not silently change what Enter opens.
    onMouseMove: (e: React.MouseEvent) => {
      const at = `${e.clientX},${e.clientY}`
      if (at === lastPointer.current) return
      lastPointer.current = at
      if (indexOf(o) !== active) setActive(indexOf(o))
    },
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => go(o),
  })

  const recentOptions = options.filter((o) => o.kind === "recent")
  const categoryOptions = options.filter((o) => o.kind === "category")
  const productOptions = options.filter((o): o is Extract<Option, { kind: "product" }> => o.kind === "product")
  const farmOptions = options.filter((o): o is Extract<Option, { kind: "farm" }> => o.kind === "farm")
  const allOption = options.find((o) => o.kind === "all")
  const noMatches = !!data && !data.products.length && !data.farms.length && !data.categories.length
  const panelVisible = open && (options.length > 0 || showResults)

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <form role="search" onSubmit={submit} action="/products">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search the marketplace
        </label>
        <SearchField
          busy={loading && showResults}
          showClear={!!query}
          onClear={() => {
            setQuery("")
            inputRef.current?.focus()
          }}
          inputProps={{
            ref: inputRef,
            id: `${listId}-input`,
            name: "q",
            value: query,
            role: "combobox",
            "aria-expanded": panelVisible,
            "aria-controls": `${listId}-list`,
            "aria-autocomplete": "list",
            "aria-activedescendant": active >= 0 ? optionId(active) : undefined,
            onChange: (e) => {
              setQuery(e.target.value)
              setOpen(true)
            },
            onFocus: () => setOpen(true),
            onKeyDown,
          }}
        />
      </form>

      {panelVisible && (
        <div
          id={`${listId}-list`}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-[0_24px_48px_-20px_rgb(43_33_24/0.35)] md:min-w-[30rem]"
        >
          {recentOptions.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Recent searches</p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => writeStored(RECENT_KEY, null)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
              {recentOptions.map((o) => (
                <div key={`r-${o.label}`} className={optionClass(o)} {...optionProps(o)}>
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{o.label}</span>
                </div>
              ))}
            </div>
          )}

          {categoryOptions.length > 0 && (
            <div className="mb-1 px-1 py-1.5">
              <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {showResults ? "Categories" : "Popular categories"}
              </p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {categoryOptions.map((o) => (
                  <div
                    key={`c-${o.href}`}
                    {...optionProps(o)}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      indexOf(o) === active ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50"
                    )}
                  >
                    <Highlight text={o.label} query={showResults ? trimmed : ""} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {productOptions.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Products</p>
              {productOptions.map((o) => (
                <div key={o.href} className={optionClass(o)} {...optionProps(o)}>
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-secondary">
                    <SmartImage src={o.item.image} alt="" sizes="40px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      <Highlight text={o.item.name} query={trimmed} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.item.storeName} · {o.item.category}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{formatCents(o.item.fromPriceCents)}</span>
                </div>
              ))}
            </div>
          )}

          {farmOptions.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Farms</p>
              {farmOptions.map((o) => (
                <div key={o.href} className={optionClass(o)} {...optionProps(o)}>
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                    <SmartImage src={o.item.photo} alt="" sizes="36px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      <Highlight text={o.item.storeName} query={trimmed} />
                    </span>
                    {farmPlace(o.item) && (
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {farmPlace(o.item)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {noMatches && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matches for <span className="font-semibold text-foreground">“{trimmed}”</span>. Try a different word, or{" "}
              <Link href="/products" className="font-semibold text-primary hover:underline" onClick={() => setOpen(false)}>
                browse everything
              </Link>
              .
            </p>
          )}

          {allOption && (
            <div className={cn(optionClass(allOption), "mt-1 border-t pt-2.5")} {...optionProps(allOption)}>
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">
                Search all products for <span className="font-semibold">“{allOption.label}”</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Header search with live suggestions; falls back to a plain field while the URL state resolves. */
export function HeaderSearch(props: HeaderSearchProps) {
  return (
    <Suspense
      fallback={
        <form role="search" action="/products" className={props.className}>
          <SearchField inputProps={{ name: "q", "aria-label": "Search the marketplace" }} />
        </form>
      }
    >
      <HeaderSearchInner {...props} />
    </Suspense>
  )
}
