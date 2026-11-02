import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, MapPin } from "lucide-react"
import { ProductCard, ProductGrid } from "@/components/product-card"
import { VendorCard } from "@/components/vendor-card"
import { SmartImage } from "@/components/storefront/smart-image"
import { Eyebrow, JsonLd, SectionHeading } from "@/components/storefront/primitives"
import { ShelfTabs } from "@/components/storefront/shelf-tabs"
import { RecentlyViewed } from "@/components/storefront/recently-viewed"
import {
  AU_STATES,
  SITE_NAME,
  SITE_URL,
  farmPlace,
  getCatalog,
  getFarms,
  getOverview,
  type CatalogResponse,
} from "@/lib/storefront"

export const metadata: Metadata = {
  title: { absolute: "FarmMarket — Fresh food direct from independent Australian farms" },
  description:
    "Shop fresh produce, meat, eggs, dairy, seafood and honey straight from independent Australian farmers. Every product is listed and sent by the farm that grows it.",
  alternates: { canonical: "/" },
}

const primaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
const secondaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md border border-foreground/20 px-7 text-sm font-semibold transition-colors hover:border-foreground/50 hover:bg-background/60"

const WHY = [
  {
    title: "Straight from the grower",
    body: "Every listing belongs to the farm that grew, raised or made it, and that farm packs and sends your order.",
  },
  {
    title: "Your money goes to the farm",
    body: "Farms set their own prices, and each order is paid out to the farm that fulfils it.",
  },
  {
    title: "Reviews you can trust",
    body: "Only customers with a completed order can review a product, so ratings come from people who bought it.",
  },
  {
    title: "Delivery on the farm's terms",
    body: "Each farm sets its own delivery rates, free-delivery thresholds and, where it can, pickup. You choose at checkout.",
  },
]

function shelf(data: CatalogResponse | null) {
  return data?.items ?? []
}

export default async function Home() {
  const [overview, featured, popular, newest, topRated, onSale, farms] = await Promise.all([
    getOverview(),
    getCatalog({ featured: true, inStock: true, pageSize: 3 }),
    getCatalog({ sort: "best-selling", inStock: true, pageSize: 8 }),
    getCatalog({ sort: "newest", inStock: true, pageSize: 8 }),
    getCatalog({ sort: "top-rated", inStock: true, pageSize: 8 }),
    getCatalog({ onSale: true, inStock: true, pageSize: 8 }),
    getFarms({ sort: "recommended" }),
  ])

  const stats = overview?.stats
  const categories = overview?.categories ?? []
  const allFarms = farms?.items.filter((f) => f.productCount > 0) ?? []
  const spotlight = allFarms.slice(0, 3)
  const otherFarms = allFarms.slice(3)
  const heroFarm = spotlight[0]
  const stateCounts = new Map((overview?.states ?? []).map((s) => [s.code, s.count]))

  const shelves = [
    { id: "popular", label: "Popular now", href: "/products?sort=best-selling", items: shelf(popular) },
    { id: "new", label: "Just added", href: "/products?sort=newest", items: shelf(newest) },
    { id: "top-rated", label: "Top rated", href: "/products?sort=top-rated", items: shelf(topRated) },
    { id: "on-sale", label: "On sale", href: "/products?sale=1", items: shelf(onSale) },
  ].filter((s) => s.items.length > 0)

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }}
      />

      {/* ───── Hero ───── */}
      <section className="relative bg-secondary/55">
        <div className="grid lg:min-h-[600px] lg:grid-cols-12">
          <div className="flex flex-col justify-center px-4 py-14 sm:px-6 lg:col-span-5 lg:py-20 lg:pl-[max(2rem,calc((100vw-1320px)/2+2rem))] lg:pr-12">
            {stats && stats.farms > 0 && <Eyebrow>Direct from {stats.farms} independent Australian farms</Eyebrow>}
            <h1 className="mt-5 font-serif text-[2.75rem] font-medium leading-[1.02] tracking-[-0.03em] sm:text-6xl xl:text-[4.75rem]">
              Good food starts at the farm.
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted-foreground">
              Discover fresh, locally grown produce and quality farm products from independent Australian farmers.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/products" className={primaryCta}>
                Explore products
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/vendors" className={secondaryCta}>
                Discover local farms
              </Link>
            </div>
            {stats && (
              <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-foreground/10 pt-6">
                {[
                  { label: stats.farms === 1 ? "Farm" : "Farms", value: stats.farms },
                  { label: "Products", value: stats.products },
                  { label: stats.states === 1 ? "State" : "States", value: stats.states },
                ].map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs text-muted-foreground">{s.label}</dt>
                    <dd className="mt-1 font-serif text-3xl font-medium tabular-nums">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="relative min-h-[340px] sm:min-h-[440px] lg:col-span-7 lg:min-h-0">
            <SmartImage
              src="/images/hero-harvest.jpg"
              alt="Hands picking ripe strawberries into punnets in a straw-mulched field"
              sizes="(min-width: 1024px) 58vw, 100vw"
              priority
            />
            {heroFarm && (
              <Link
                href={`/vendors/${heroFarm.id}`}
                className="group absolute bottom-4 left-4 right-4 flex max-w-sm items-center gap-3 rounded-lg bg-background/95 p-3 pr-4 shadow-[0_16px_40px_-20px_rgb(0_0_0/0.5)] backdrop-blur-sm sm:bottom-6 sm:left-6 sm:right-auto"
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-secondary">
                  <SmartImage src={heroFarm.photo} alt="" sizes="48px" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-olive">Meet the farm</span>
                  <span className="block truncate font-serif text-lg font-medium leading-tight">{heroFarm.storeName}</span>
                  {farmPlace(heroFarm) && (
                    <span className="block truncate text-xs text-muted-foreground">{farmPlace(heroFarm)}</span>
                  )}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ───── Categories ───── */}
      {categories.length > 0 && (
        <section aria-labelledby="categories" className="shell py-16 lg:py-24">
          <SectionHeading
            id="categories"
            eyebrow="Shop by category"
            title="What's coming off the farms"
            link={{ href: "/products", label: "Shop all products" }}
          />
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 sm:scroll-px-6 pb-2 scrollbar-none sm:-mx-6 sm:gap-4 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:gap-x-4 lg:gap-y-8 lg:overflow-visible lg:px-0">
            {categories.map((category) => (
              <li key={category.id} className="w-[36%] shrink-0 snap-start sm:w-[22%] lg:w-auto">
                <Link href={`/products?category=${category.slug}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-secondary">
                    <SmartImage
                      src={category.image}
                      alt=""
                      sizes="(min-width: 1024px) 170px, 36vw"
                      className="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    />
                  </div>
                  <p className="mt-2.5 text-sm font-semibold group-hover:text-primary">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {category.productCount} {category.productCount === 1 ? "product" : "products"}
                  </p>
                </Link>
              </li>
            ))}
            <li className="w-[36%] shrink-0 snap-start sm:w-[22%] lg:w-auto">
              <Link
                href="/products"
                className="group flex aspect-[4/5] flex-col justify-between rounded-md bg-forest p-4 text-forest-foreground"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-forest-foreground/70">Everything</span>
                <span>
                  <span className="block font-serif text-xl font-medium leading-tight">
                    Shop all {stats?.products ?? ""} products
                  </span>
                  <ArrowRight className="mt-3 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* ───── Sponsored listings ───── */}
      {featured && featured.items.length > 0 && (
        <section aria-labelledby="featured" className="border-y bg-card">
          <div className="shell grid gap-10 py-16 lg:grid-cols-12 lg:gap-14">
            <SectionHeading
              id="featured"
              eyebrow="Sponsored"
              title="Featured by our farms"
              description="Farms pay to feature these listings for a limited time."
              link={featured.total > featured.items.length ? { href: "/products?featured=1", label: "See all featured" } : undefined}
              className="mb-0 lg:col-span-4 lg:flex-col lg:items-start lg:justify-start"
            />
            <ProductGrid className="md:grid-cols-3 lg:col-span-8 xl:grid-cols-3">
              {featured.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ProductGrid>
          </div>
        </section>
      )}

      {/* ───── Product shelves ───── */}
      {shelves.length > 0 && (
        <section aria-labelledby="market" className="shell py-16 lg:py-24">
          <SectionHeading id="market" eyebrow="Fresh picks" title="Shop the market" className="mb-6" />
          <ShelfTabs
            tabs={shelves.map((s) => ({
              id: s.id,
              label: s.label,
              href: s.href,
              content: (
                <>
                  <ProductGrid>
                    {s.items.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </ProductGrid>
                  <Link
                    href={s.href}
                    className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline sm:hidden"
                  >
                    View all <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ),
            }))}
          />
        </section>
      )}

      {/* ───── Farms ───── */}
      {spotlight.length > 0 && (
        <section aria-labelledby="farms" className="bg-secondary/55">
          <div className="shell py-16 lg:py-24">
            <SectionHeading
              id="farms"
              eyebrow="The growers"
              title="Meet the farms behind your food"
              description="Every farm runs its own storefront on FarmMarket. When you buy, you buy from them."
              link={{ href: "/vendors", label: "All farms" }}
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {spotlight.map((farm) => (
                <VendorCard key={farm.id} vendor={farm} />
              ))}
            </div>
            {otherFarms.length > 0 && (
              <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Also selling here: </span>
                {otherFarms.map((farm, i) => (
                  <span key={farm.id}>
                    <Link href={`/vendors/${farm.id}`} className="underline-offset-4 hover:text-primary hover:underline">
                      {farm.storeName}
                    </Link>
                    {farm.state && <span className="text-muted-foreground/70"> ({farm.state})</span>}
                    {i < otherFarms.length - 1 ? ", " : "."}
                  </span>
                ))}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ───── Why ───── */}
      <section aria-labelledby="why" className="shell grid items-center gap-10 py-16 lg:grid-cols-12 lg:gap-16 lg:py-24">
        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-secondary lg:col-span-6 lg:aspect-[5/6]">
          <SmartImage
            src="/images/market-crate.jpg"
            alt="Crates of freshly pulled carrots and leeks with their roots still on"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        </div>
        <div className="lg:col-span-6">
          <Eyebrow>Why FarmMarket</Eyebrow>
          <h2 id="why" className="mt-3 font-serif text-[1.75rem] font-medium leading-[1.15] tracking-[-0.015em] sm:text-4xl">
            A shorter path from paddock to plate
          </h2>
          <ol className="mt-10 divide-y border-y">
            {WHY.map((item, i) => (
              <li key={item.title} className="grid grid-cols-[3rem_1fr] gap-x-4 py-6">
                <span className="font-serif text-2xl font-medium text-terracotta tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───── By state ───── */}
      <section aria-labelledby="states" className="shell pb-16 lg:pb-24">
        <SectionHeading
          id="states"
          eyebrow="Local to you"
          title="Find farms in your state"
          description="Browse the farms closest to you, from Tasmania's dairy country to Queensland's coast."
        />
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
          {AU_STATES.map((state) => {
            const count = stateCounts.get(state.code) ?? 0
            return (
              <li key={state.code} className="bg-background">
                <Link
                  href={`/vendors?state=${state.code}`}
                  className="group flex h-full flex-col justify-between gap-6 p-5 transition-colors hover:bg-card sm:p-6"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">{state.code}</span>
                    <ArrowRight className="mt-2 h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold leading-snug">{state.name}</span>
                    <span className={count ? "text-xs text-olive" : "text-xs text-muted-foreground"}>
                      {count ? `${count} ${count === 1 ? "farm" : "farms"}` : "No farms yet"}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <RecentlyViewed />

      {/* ───── Closing call to action ───── */}
      <section aria-labelledby="closing" className="relative isolate overflow-hidden bg-forest">
        <SmartImage src="/images/field-rows.jpg" alt="" sizes="100vw" className="-z-10 opacity-55" />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-forest via-forest/80 to-forest/20" />
        <div className="shell py-24 text-forest-foreground lg:py-32">
          <h2 id="closing" className="max-w-xl font-serif text-4xl font-medium leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
            Know who grows your food.
          </h2>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-forest-foreground/80">
            Browse farm storefronts, read reviews from real customers and buy straight from the people who produce it.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/vendors"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-forest-foreground px-7 text-sm font-semibold text-forest transition-colors hover:bg-forest-foreground/90"
            >
              <MapPin className="h-4 w-4" />
              Discover local farms
            </Link>
            <Link
              href="/vendor/onboarding"
              className="inline-flex h-12 items-center justify-center rounded-md border border-forest-foreground/40 px-7 text-sm font-semibold transition-colors hover:border-forest-foreground hover:bg-forest-foreground/10"
            >
              Sell on FarmMarket
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
