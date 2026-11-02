import type { Metadata } from "next"
import Link from "next/link"
import { Store } from "lucide-react"
import { VendorCard } from "@/components/vendor-card"
import { Breadcrumbs, EmptyState } from "@/components/storefront/primitives"
import { CatalogNavigation, PendingRegion } from "@/components/storefront/catalog-controls"
import { FarmSortSelect, LiveSearchField } from "@/components/storefront/farm-directory-controls"
import { AU_STATES, FARM_SORTS, getFarms, stateName } from "@/lib/storefront"
import { cn } from "@/lib/utils"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function readParams(raw: Awaited<SearchParams>) {
  const get = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "") || undefined
  const state = get("state")?.toUpperCase()
  const sort = get("sort")
  return {
    q: get("q"),
    state: state && AU_STATES.some((s) => s.code === state) ? state : undefined,
    sort: sort && FARM_SORTS.some((s) => s.value === sort) ? sort : undefined,
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { q, state, sort } = readParams(await searchParams)
  const title = state ? `Farms in ${stateName(state)}` : "Discover farms"
  return {
    title,
    description: state
      ? `Independent farms in ${stateName(state)} selling direct on FarmMarket.`
      : "Meet the independent Australian farms selling direct on FarmMarket, and shop each farm's own storefront.",
    alternates: { canonical: state ? `/vendors?state=${state}` : "/vendors" },
    robots: q || sort ? { index: false, follow: true } : undefined,
  }
}

export default async function VendorsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = readParams(await searchParams)
  const [all, data] = await Promise.all([
    getFarms(),
    getFarms({ q: params.q, state: params.state, sort: params.sort }),
  ])
  const counts = new Map((all?.states ?? []).map((s) => [s.code, s.count]))
  const totalFarms = all?.total ?? 0
  const farms = data?.items ?? []

  const stateHref = (code?: string) => {
    const search = new URLSearchParams()
    if (code) search.set("state", code)
    if (params.q) search.set("q", params.q)
    if (params.sort) search.set("sort", params.sort)
    const query = search.toString()
    return query ? `/vendors?${query}` : "/vendors"
  }

  return (
    <div className="shell pb-24 pt-6">
      <Breadcrumbs items={[{ label: "Farms", href: params.state ? "/vendors" : undefined }, ...(params.state ? [{ label: stateName(params.state) }] : [])]} />

      <header className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <h1 className="font-serif text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
            {params.state ? `Farms in ${stateName(params.state)}` : "Discover farms"}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Every farm runs its own storefront here. Read their story, see where they are, and buy directly from them.
          </p>
        </div>
        {totalFarms > 0 && (
          <p className="text-sm text-muted-foreground lg:col-span-5 lg:text-right">
            <span className="font-serif text-3xl font-medium text-foreground">{totalFarms}</span> independent{" "}
            {totalFarms === 1 ? "farm" : "farms"} across {counts.size} {counts.size === 1 ? "state" : "states"}
          </p>
        )}
      </header>

      <nav aria-label="Filter by state" className="-mx-4 mt-8 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <ul className="flex gap-2">
          {[{ code: undefined, label: "All states", count: totalFarms }, ...AU_STATES.map((s) => ({ code: s.code, label: s.code, count: counts.get(s.code) ?? 0 }))].map(
            (s) => {
              const active = params.state === s.code
              return (
                <li key={s.label}>
                  <Link
                    href={stateHref(s.code)}
                    aria-current={active ? "page" : undefined}
                    title={s.code ? stateName(s.code) : undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/40",
                      !active && s.count === 0 && "text-muted-foreground"
                    )}
                  >
                    {s.label}
                    <span className={cn("text-xs font-normal", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {s.count}
                    </span>
                  </Link>
                </li>
              )
            }
          )}
        </ul>
      </nav>

      <CatalogNavigation>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <LiveSearchField
            placeholder="Search farms by name, region or what they grow"
            label="Search farms"
            className="sm:max-w-md sm:flex-1"
          />
          <FarmSortSelect />
        </div>

        <PendingRegion className="mt-8">
          {farms.length === 0 ? (
            <EmptyState icon={Store} title={params.state && !params.q ? `No farms in ${stateName(params.state)} yet` : "No farms found"}>
              {params.q ? "Try a different name or region. " : "New farms join regularly. "}
              <Link href="/vendors" className="font-semibold text-primary hover:underline">
                See all farms
              </Link>
            </EmptyState>
          ) : (
            <>
              <p className="mb-5 text-sm text-muted-foreground" aria-live="polite">
                Showing <span className="font-semibold text-foreground">{farms.length}</span>{" "}
                {farms.length === 1 ? "farm" : "farms"}
              </p>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {farms.map((farm) => (
                  <VendorCard key={farm.id} vendor={farm} />
                ))}
              </div>
            </>
          )}
        </PendingRegion>
      </CatalogNavigation>
    </div>
  )
}
