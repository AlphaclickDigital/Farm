import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { BadgeCheck, CalendarDays, MapPin, Package, Phone, SearchX } from "lucide-react"
import { ProductCard, ProductGrid } from "@/components/product-card"
import { SmartImage } from "@/components/storefront/smart-image"
import { Breadcrumbs, EmptyState, JsonLd } from "@/components/storefront/primitives"
import { RatingSummary, Stars } from "@/components/storefront/rating"
import { RatingBreakdown } from "@/components/storefront/rating-breakdown"
import { DeliveryOptions } from "@/components/storefront/delivery-options"
import { Pagination } from "@/components/storefront/pagination"
import { CatalogNavigation, PendingRegion, SortSelect } from "@/components/storefront/catalog-controls"
import { LiveSearchField } from "@/components/storefront/farm-directory-controls"
import { formatDate } from "@/lib/format"
import { API_URL, SITE_URL, SORT_OPTIONS, farmPlace, getCatalog, getFarm, getShippingOptions, stateName } from "@/lib/storefront"
import { cn } from "@/lib/utils"

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

interface FarmReview {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  user: { id: string; name: string | null }
  product: { id: string; name: string } | null
  vendorReply?: string | null
}

const PAGE_SIZE = 12
const REVIEWS_SHOWN = 8
const SORTS = SORT_OPTIONS.map((o) => o.value) as string[]

const loadFarm = cache((id: string) => getFarm(id))

async function getFarmReviews(id: string): Promise<FarmReview[]> {
  try {
    const res = await fetch(`${API_URL}/reviews/vendor/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!res.ok) return []
    return (await res.json()).reviews ?? []
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const farm = await loadFarm(id)
  if (!farm) return { title: "Farm not found", robots: { index: false } }
  const place = farmPlace(farm)
  const region = farm.location ? `${farm.location}${farm.state ? ` (${farm.state})` : ""}` : stateName(farm.state)
  const description =
    farm.description?.replace(/\s+/g, " ").slice(0, 155) ??
    `${farm.storeName}${place ? ` in ${place}` : ""} — shop direct from the farm on FarmMarket.`
  return {
    // "Town (STATE)" rather than the on-page "Town, STATE": Next's route
    // announcer reads the title out, so the two shouldn't read identically.
    title: `${farm.storeName}${region ? ` — ${region}` : ""}`,
    description,
    alternates: { canonical: `/vendors/${farm.id}` },
    openGraph: {
      title: farm.storeName,
      description,
      url: `/vendors/${farm.id}`,
      images: farm.coverPhoto ? [{ url: farm.coverPhoto, alt: farm.storeName }] : undefined,
    },
  }
}

export default async function VendorStorePage({ params, searchParams }: Props) {
  const { id } = await params
  const raw = await searchParams
  const get = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "") || undefined
  const category = get("category")
  const q = get("q")
  const sortParam = get("sort")
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : undefined
  const page = Math.max(1, Number(get("page")) || 1)

  const farm = await loadFarm(id)
  if (!farm) notFound()

  const [catalog, reviews, shipping] = await Promise.all([
    getCatalog({ farm: farm.id, category, q, sort, page, pageSize: PAGE_SIZE }),
    getFarmReviews(farm.id),
    getShippingOptions(farm.id),
  ])

  const place = farmPlace(farm)
  const joined = new Date(farm.createdAt).toLocaleDateString("en-AU", { month: "long", year: "numeric" })
  const tabHref = (slug?: string) => {
    const search = new URLSearchParams()
    if (slug) search.set("category", slug)
    if (sort) search.set("sort", sort)
    const query = search.toString()
    return `/vendors/${farm.id}${query ? `?${query}` : ""}#products`
  }
  const linkParams = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"))

  return (
    <>
      <div className="shell pb-4 pt-6">
        <Breadcrumbs
          items={[{ label: "Farms", href: "/vendors" }, ...(farm.state ? [{ label: stateName(farm.state), href: `/vendors?state=${farm.state}` }] : []), { label: farm.storeName }]}
        />
      </div>

      {/* Cover */}
      <div className="relative h-56 bg-secondary sm:h-72 lg:h-[22rem]">
        <SmartImage src={farm.coverPhoto} alt="" sizes="100vw" priority />
        <div className="absolute inset-0 bg-linear-to-t from-foreground/35 via-transparent to-transparent" />
      </div>

      <div className="shell">
        {/* Only the logo overlaps the cover; the name sits on the page background. */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-7">
          <div className="relative -mt-14 h-28 w-28 shrink-0 overflow-hidden rounded-full border-[5px] border-background bg-secondary shadow-sm sm:-mt-20 sm:h-36 sm:w-36">
            <SmartImage src={farm.photo} alt={`${farm.storeName} logo`} sizes="144px" priority />
          </div>
          <div className="min-w-0 flex-1 sm:pb-1 sm:pt-6">
            <h1 className="font-serif text-[2.25rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-5xl">{farm.storeName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {place && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-olive" />
                  {place}
                </span>
              )}
              {farm.rating.count > 0 && (
                <a href="#reviews" className="hover:underline">
                  <RatingSummary average={farm.rating.average} count={farm.rating.count} className="text-sm" />
                </a>
              )}
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4" />
                {farm.productCount} {farm.productCount === 1 ? "product" : "products"}
              </span>
              <span className="flex items-center gap-1.5" title="Every farm is reviewed and approved before it can sell">
                <BadgeCheck className="h-4 w-4 text-olive" />
                Approved seller
              </span>
              {farm.isFeatured && (
                <span className="rounded-sm bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
                  Sponsored
                </span>
              )}
            </div>
          </div>
        </div>

        {/* In-page navigation */}
        <nav aria-label="Farm sections" className="relative z-20 -mx-4 mt-8 border-b bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 md:sticky md:top-[72px] lg:top-[116px] lg:mx-0 lg:px-0">
          <ul className="flex gap-7 text-sm font-semibold">
            {[
              { href: "#products", label: "Products" },
              { href: "#story", label: "Our story" },
              { href: "#reviews", label: `Reviews${farm.rating.count ? ` (${farm.rating.count})` : ""}` },
            ].map((item) => (
              <li key={item.href}>
                <a href={item.href} className="block py-3.5 text-foreground/80 hover:text-primary">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Products */}
        <section id="products" aria-labelledby="products-heading" className="scroll-mt-44 pt-10">
          <h2 id="products-heading" className="sr-only">
            Products
          </h2>
          {farm.categories.length > 1 && (
            <ul className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" aria-label="Product categories">
              {[{ slug: undefined, name: "All products", count: farm.productCount }, ...farm.categories].map((c) => {
                const active = category === c.slug
                return (
                  <li key={c.name}>
                    <Link
                      href={tabHref(c.slug)}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors",
                        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/40"
                      )}
                    >
                      {c.name}
                      <span className={cn("text-xs font-normal", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {c.count}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          <CatalogNavigation>
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <LiveSearchField
                placeholder={`Search ${farm.storeName}`}
                label={`Search products from ${farm.storeName}`}
                className="sm:max-w-sm sm:flex-1"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="shrink-0 text-sm text-muted-foreground sm:hidden">{catalog?.total ?? 0} products</p>
                <SortSelect className="w-auto sm:w-[210px]" />
              </div>
            </div>
            <PendingRegion>
              {!catalog || catalog.items.length === 0 ? (
                <EmptyState icon={q ? SearchX : Package} title={q ? `Nothing matching “${q}”` : "No products listed yet"}>
                  {q || category ? (
                    <Link href={`/vendors/${farm.id}#products`} className="font-semibold text-primary hover:underline">
                      Show all of {farm.storeName}&apos;s products
                    </Link>
                  ) : (
                    `${farm.storeName} hasn't listed any products yet.`
                  )}
                </EmptyState>
              ) : (
                <ProductGrid>
                  {catalog.items.map((product) => (
                    <ProductCard key={product.id} product={product} hideFarm />
                  ))}
                </ProductGrid>
              )}
            </PendingRegion>
            {catalog && (
              <Pagination
                page={catalog.page}
                totalPages={catalog.totalPages}
                basePath={`/vendors/${farm.id}`}
                params={linkParams}
                anchor="products"
              />
            )}
          </CatalogNavigation>
        </section>

        {/* Story */}
        <section id="story" aria-labelledby="story-heading" className="mt-24 scroll-mt-44 border-t pt-14">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-olive">Our story</p>
              <h2 id="story-heading" className="mt-3 font-serif text-3xl font-medium tracking-[-0.015em] sm:text-4xl">
                About {farm.storeName}
              </h2>
              {farm.description ? (
                <p className="mt-6 max-w-prose whitespace-pre-line text-[17px] leading-relaxed text-foreground/85">{farm.description}</p>
              ) : (
                <p className="mt-6 text-muted-foreground">This farm hasn&apos;t shared its story yet.</p>
              )}
            </div>
            <aside className="space-y-8 lg:col-span-5">
              <dl className="divide-y rounded-md border bg-card text-sm">
                {place && (
                  <div className="flex gap-3 px-4 py-3.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-olive" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Location</dt>
                      <dd className="font-semibold">{farm.location ?? stateName(farm.state)}</dd>
                      {farm.location && farm.state && <dd className="text-muted-foreground">{stateName(farm.state)}</dd>}
                    </div>
                  </div>
                )}
                {farm.phone && (
                  <div className="flex gap-3 px-4 py-3.5">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-olive" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Phone</dt>
                      <dd>
                        <a href={`tel:${farm.phone.replace(/[^0-9+]/g, "")}`} className="font-semibold hover:text-primary hover:underline">
                          {farm.phone}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 px-4 py-3.5">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-olive" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Selling on FarmMarket since</dt>
                    <dd className="font-semibold">{joined}</dd>
                  </div>
                </div>
                {farm.categories.length > 0 && (
                  <div className="flex gap-3 px-4 py-3.5">
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-olive" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Sells</dt>
                      <dd className="font-semibold">{farm.categories.map((c) => c.name).join(", ")}</dd>
                    </div>
                  </div>
                )}
              </dl>
              <DeliveryOptions options={shipping} farmName={farm.storeName} />
            </aside>
          </div>
        </section>

        {/* Reviews */}
        <section id="reviews" aria-labelledby="farm-reviews" className="mt-24 scroll-mt-44 border-t pb-24 pt-14">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-4">
              <h2 id="farm-reviews" className="font-serif text-3xl font-medium tracking-[-0.015em]">
                Customer reviews
              </h2>
              {farm.rating.count > 0 ? (
                <div className="mt-5">
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-5xl font-medium tabular-nums">{farm.rating.average.toFixed(1)}</span>
                    <div>
                      <Stars value={farm.rating.average} className="text-lg" />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {farm.rating.count} {farm.rating.count === 1 ? "review" : "reviews"} across all products
                      </p>
                    </div>
                  </div>
                  <RatingBreakdown distribution={farm.ratingDistribution} total={farm.rating.count} className="mt-6" />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No reviews yet.</p>
              )}
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                Reviews can only be left by customers with a completed order from this farm.
              </p>
            </div>
            <div className="lg:col-span-8">
              {reviews.length === 0 ? (
                <div className="rounded-md border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                  Reviews appear here once customers receive their orders.
                </div>
              ) : (
                <ul className="divide-y border-y">
                  {reviews.slice(0, REVIEWS_SHOWN).map((review) => (
                    <li key={review.id} className="py-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Stars value={review.rating} className="text-sm" />
                          <p className="text-sm font-semibold">{review.user.name || "Anonymous"}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-[11px] font-semibold text-olive">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Verified purchase
                        {review.product && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            ·{" "}
                            <Link href={`/products/${review.product.id}`} className="hover:text-primary hover:underline">
                              {review.product.name}
                            </Link>
                          </span>
                        )}
                      </p>
                      {review.comment && (
                        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-foreground/85">{review.comment}</p>
                      )}
                      {review.vendorReply && (
                        <div className="mt-4 border-l-2 border-primary/40 bg-secondary/60 px-4 py-3">
                          <p className="text-xs font-semibold">Reply from {farm.storeName}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.vendorReply}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {reviews.length > REVIEWS_SHOWN && (
                <p className="mt-5 text-sm text-muted-foreground">
                  Showing the {REVIEWS_SHOWN} most recent of {reviews.length} reviews. Each product page lists all of its reviews.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: farm.storeName,
          description: farm.description ?? undefined,
          url: `${SITE_URL}/vendors/${farm.id}`,
          image: farm.coverPhoto ?? farm.photo ?? undefined,
          logo: farm.photo ?? undefined,
          telephone: farm.phone ?? undefined,
          ...(farm.state && {
            address: {
              "@type": "PostalAddress",
              addressLocality: farm.location ?? undefined,
              addressRegion: farm.state,
              addressCountry: "AU",
            },
          }),
          ...(farm.rating.count > 0 && {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: farm.rating.average.toFixed(1),
              reviewCount: farm.rating.count,
            },
          }),
        }}
      />
    </>
  )
}
