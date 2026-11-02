import type { Metadata } from "next"
import Link from "next/link"
import { SearchX } from "lucide-react"
import { ProductCard, ProductGrid } from "@/components/product-card"
import { Breadcrumbs, EmptyState, JsonLd } from "@/components/storefront/primitives"
import { Pagination } from "@/components/storefront/pagination"
import {
  CatalogFilters,
  CatalogNavigation,
  CatalogToolbar,
  PendingRegion,
} from "@/components/storefront/catalog-controls"
import {
  SITE_URL,
  SORT_OPTIONS,
  departmentFor,
  departmentLinks,
  getCatalog,
  getOverview,
  stateName,
} from "@/lib/storefront"
import { cn } from "@/lib/utils"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const PAGE_SIZE = 24
const SORTS = SORT_OPTIONS.map((o) => o.value) as string[]

function readParams(raw: Awaited<SearchParams>) {
  const get = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : undefined) || undefined
  const dollars = (key: string) => {
    const value = get(key)
    return value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined
  }
  const rating = Number(get("rating"))
  const page = Number(get("page"))
  const sort = get("sort")
  return {
    q: get("q"),
    category: get("category"),
    farm: get("farm"),
    state: get("state")?.toUpperCase(),
    min: dollars("min"),
    max: dollars("max"),
    rating: rating >= 1 && rating <= 5 ? Math.floor(rating) : undefined,
    stock: get("stock") === "1",
    sale: get("sale") === "1",
    featured: get("featured") === "1",
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

type Params = ReturnType<typeof readParams>

function describe(params: Params, categories: { slug: string; name: string }[]) {
  const department = departmentFor(params.category, categories)
  const selectedCategories = params.category?.split(",").filter(Boolean) ?? []
  const singleCategory =
    selectedCategories.length === 1 ? categories.find((c) => c.slug === selectedCategories[0]) : undefined
  const singleState = params.state && !params.state.includes(",") ? stateName(params.state) : undefined

  if (params.q) return { title: `Results for “${params.q}”`, crumb: "Search", description: undefined }
  if (department) {
    return {
      title: department.label,
      crumb: department.label,
      description: `${department.label} from independent Australian farms, sold and sent by the farm that produced it.`,
    }
  }
  if (singleCategory) {
    return {
      title: singleCategory.name,
      crumb: singleCategory.name,
      description: `Shop ${singleCategory.name.toLowerCase()} direct from independent Australian farms.`,
    }
  }
  if (singleState) {
    return {
      title: `From farms in ${singleState}`,
      crumb: singleState,
      description: `Products from independent farms in ${singleState}.`,
    }
  }
  if (params.featured) return { title: "Featured listings", crumb: "Featured", description: "Listings farms have paid to feature." }
  if (params.sale) return { title: "On sale", crumb: "On sale", description: "Current discounts set by our farms." }
  return {
    title: "Shop all",
    crumb: undefined,
    description: "Fresh produce, meat, dairy, seafood and pantry goods from independent Australian farms.",
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = readParams(await searchParams)
  const overview = await getOverview()
  const { title, description } = describe(params, overview?.categories ?? [])

  // Only plain category listings are worth indexing; searches, sorts and
  // filter combinations are thin duplicates of them.
  const indexable =
    !params.q && !params.farm && !params.state && params.min === undefined && params.max === undefined &&
    !params.rating && !params.stock && !params.sale && !params.featured && !params.sort
  const canonical = params.category ? `/products?category=${params.category}` : "/products"

  return {
    title: params.page > 1 ? `${title} — page ${params.page}` : title,
    description,
    alternates: { canonical },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: canonical },
  }
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const params = readParams(raw)

  const [overview, catalog] = await Promise.all([
    getOverview(),
    getCatalog({
      q: params.q,
      category: params.category,
      farm: params.farm,
      state: params.state,
      minPrice: params.min !== undefined ? Math.round(params.min * 100) : undefined,
      maxPrice: params.max !== undefined ? Math.round(params.max * 100) : undefined,
      rating: params.rating,
      inStock: params.stock,
      onSale: params.sale,
      featured: params.featured,
      sort: params.sort,
      page: params.page,
      pageSize: PAGE_SIZE,
    }),
  ])

  const categories = overview?.categories ?? []
  const departments = departmentLinks(categories)
  const { title, crumb, description } = describe(params, categories)
  const categoryNames = Object.fromEntries(categories.map((c) => [c.slug, c.name]))
  const farmNames = Object.fromEntries((catalog?.facets.farms ?? []).map((f) => [f.id, f.storeName]))
  const activeDepartment = departmentFor(params.category, categories)

  const linkParams = Object.fromEntries(
    Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string")
  )
  const hasFilters = Object.keys(linkParams).some((k) => k !== "sort" && k !== "page")

  return (
    <div className="shell pb-24 pt-6">
      <Breadcrumbs items={[{ label: "Shop", href: "/products" }, ...(crumb ? [{ label: crumb }] : [])]} />

      <header className="mt-6 max-w-3xl">
        <h1 className="font-serif text-4xl font-medium tracking-[-0.02em] sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </header>

      <nav aria-label="Departments" className="-mx-4 mt-7 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <ul className="flex gap-2">
          {[{ label: "All products", href: "/products", active: !params.category }, ...departments.map((d) => ({
            label: d.label,
            href: d.href,
            active: activeDepartment?.label === d.label,
          }))].map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                aria-current={d.active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors",
                  d.active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/40"
                )}
              >
                {d.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!catalog ? (
        <EmptyState title="We couldn't load the market" className="mt-10">
          Something went wrong on our side. Please refresh the page in a moment.
        </EmptyState>
      ) : (
        <CatalogNavigation>
          <div className="mt-10 grid gap-10 lg:grid-cols-[232px_minmax(0,1fr)] xl:gap-14">
            <aside className="hidden lg:block" aria-label="Filters">
              <div className="sticky top-36">
                <CatalogFilters facets={catalog.facets} categoryNames={categoryNames} />
              </div>
            </aside>

            <section aria-label="Products">
              <CatalogToolbar
                total={catalog.total}
                facets={catalog.facets}
                categoryNames={categoryNames}
                farmNames={farmNames}
              />
              <PendingRegion>
                {catalog.items.length === 0 ? (
                  <EmptyState icon={SearchX} title="Nothing matches just yet">
                    {params.q ? (
                      <>Check the spelling, or try a more general word like “beef” or “honey”. </>
                    ) : (
                      <>Try removing a filter or two. </>
                    )}
                    {hasFilters && (
                      <Link href="/products" className="font-semibold text-primary hover:underline">
                        Clear everything and browse all products
                      </Link>
                    )}
                  </EmptyState>
                ) : (
                  <ProductGrid className="md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                    {catalog.items.map((product, i) => (
                      <ProductCard key={product.id} product={product} priority={i < 4} />
                    ))}
                  </ProductGrid>
                )}
              </PendingRegion>
              <Pagination page={catalog.page} totalPages={catalog.totalPages} basePath="/products" params={linkParams} />
            </section>
          </div>
        </CatalogNavigation>
      )}

      {catalog && catalog.items.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: title,
            numberOfItems: catalog.total,
            itemListElement: catalog.items.map((p, i) => ({
              "@type": "ListItem",
              position: (catalog.page - 1) * catalog.pageSize + i + 1,
              url: `${SITE_URL}/products/${p.id}`,
              name: p.name,
            })),
          }}
        />
      )}
    </div>
  )
}
