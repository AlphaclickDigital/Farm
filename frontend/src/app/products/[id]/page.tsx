import type { Metadata } from "next"
import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Lock, MapPin } from "lucide-react"
import { ProductCard, ProductGrid } from "@/components/product-card"
import { ProductReviews } from "@/components/product-reviews"
import { ProductViewTracker } from "@/components/product-view-tracker"
import { SmartImage } from "@/components/storefront/smart-image"
import { Breadcrumbs, JsonLd, SectionHeading } from "@/components/storefront/primitives"
import { RatingSummary } from "@/components/storefront/rating"
import { ProductGallery } from "@/components/storefront/product-gallery"
import { ProductPurchase } from "@/components/storefront/product-purchase"
import { DeliveryOptions } from "@/components/storefront/delivery-options"
import { RecentlyViewed, RecordRecentlyViewed } from "@/components/storefront/recently-viewed"
import { effectivePrice, maxUnits } from "@/lib/product-pricing"
import { formatBaseUnits, formatCents } from "@/lib/format"
import {
  API_URL,
  SITE_URL,
  farmPlace,
  getCatalog,
  getFarm,
  getShippingOptions,
} from "@/lib/storefront"

interface ProductDetail {
  id: string
  name: string
  slug: string
  description: string | null
  baseUnit: string
  stockAmount: number
  isActive: boolean
  discountName: string | null
  discountCents: number | null
  discountEndsAt: string | null
  category: { id: string; name: string; slug: string }
  vendor: {
    id: string
    storeName: string
    description: string | null
    photo: string | null
    coverPhoto: string | null
    location: string | null
    state: string | null
    isApproved: boolean
    isSuspended: boolean
  }
  variants: { id: string; label: string; unitAmount: number; priceCents: number; isActive: boolean }[]
  images: { id: string; url: string }[]
}

type Props = { params: Promise<{ id: string }> }

// Stock and price must be current, so the product itself is never cached.
// cache() shares the one request between generateMetadata and the page.
const getProduct = cache(async (id: string): Promise<ProductDetail | null> => {
  try {
    const res = await fetch(`${API_URL}/products/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!res.ok) return null
    const product: ProductDetail = await res.json()
    // Products of pending or suspended farms are not public.
    if (!product.vendor?.isApproved || product.vendor.isSuspended) return null
    return product
  } catch {
    return null
  }
})

async function getRatingSummary(id: string) {
  try {
    const res = await fetch(`${API_URL}/reviews/product/${encodeURIComponent(id)}`, { cache: "no-store" })
    if (!res.ok) return null
    const data: { average: number; count: number } = await res.json()
    return { average: data.average, count: data.count }
  } catch {
    return null
  }
}

function summarise(text: string | null, fallback: string) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim()
  if (!clean) return fallback
  return clean.length > 155 ? `${clean.slice(0, 152).replace(/\s+\S*$/, "")}…` : clean
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const product = await getProduct(id)
  if (!product) return { title: "Product not found", robots: { index: false } }

  const place = farmPlace(product.vendor)
  const description = summarise(
    product.description,
    `${product.name} from ${product.vendor.storeName}${place ? `, ${place}` : ""}. Buy direct from the farm.`
  )
  const image = product.images[0]?.url
  return {
    title: `${product.name} — ${product.vendor.storeName}`,
    description,
    alternates: { canonical: `/products/${product.id}` },
    robots: product.isActive ? undefined : { index: false, follow: true },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: `/products/${product.id}`,
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: product.name, description },
  }
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product) notFound()

  const vendor = product.vendor
  const [rating, farm, shipping, moreFromFarm, related] = await Promise.all([
    getRatingSummary(product.id),
    getFarm(vendor.id),
    getShippingOptions(vendor.id),
    getCatalog({ farm: vendor.id, exclude: product.id, inStock: true, pageSize: 4 }),
    getCatalog({ category: product.category.slug, exclude: product.id, inStock: true, sort: "best-selling", pageSize: 8 }),
  ])

  const place = farmPlace(vendor)
  const activeVariants = product.variants.filter((v) => v.isActive)
  const prices = activeVariants.map((v) => effectivePrice(product, v.priceCents))
  const purchasable = activeVariants.some((v) => maxUnits(product.stockAmount, v.unitAmount) >= 1)
  // "You may also like" leaves out this farm's products, which have their own shelf.
  const alsoLike = (related?.items ?? []).filter((p) => p.vendor.id !== vendor.id).slice(0, 4)

  return (
    <>
      <div className="shell pt-6">
        <Breadcrumbs
          items={[
            { label: "Shop", href: "/products" },
            { label: product.category.name, href: `/products?category=${product.category.slug}` },
            { label: product.name },
          ]}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <ProductGallery images={product.images} name={product.name} />
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <Link href={`/vendors/${vendor.id}`} className="group inline-flex items-center gap-2.5">
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                  <SmartImage src={vendor.photo} alt="" sizes="36px" />
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-semibold text-olive group-hover:underline">{vendor.storeName}</span>
                  {place && <span className="block text-xs text-muted-foreground">{place}</span>}
                </span>
              </Link>

              <h1 className="mt-5 font-serif text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]">
                {product.name}
              </h1>
              {rating && rating.count > 0 && (
                <a href="#reviews" className="mt-3 inline-flex hover:underline">
                  <RatingSummary average={rating.average} count={rating.count} className="text-sm" />
                </a>
              )}

              <div className="mt-6">
                <ProductPurchase product={product} />
              </div>

              <DeliveryOptions options={shipping} farmName={vendor.storeName} className="mt-8 border-t pt-6" />

              <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Secure checkout — payments are processed by Stripe.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <section aria-labelledby="details" className="shell mt-20 grid gap-10 border-t pt-14 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <h2 id="details" className="font-serif text-3xl font-medium tracking-[-0.015em]">
            About this product
          </h2>
          {product.description ? (
            <p className="mt-5 max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
              {product.description}
            </p>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">The farm hasn&apos;t added a description yet.</p>
          )}
        </div>
        <div className="lg:col-span-5">
          <dl className="divide-y rounded-md border bg-card text-sm">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Category</dt>
              <dd>
                <Link href={`/products?category=${product.category.slug}`} className="font-semibold hover:text-primary hover:underline">
                  {product.category.name}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Sold and sent by</dt>
              <dd className="text-right font-semibold">{vendor.storeName}</dd>
            </div>
            {vendor.state && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">Farm location</dt>
                <dd className="text-right">{place}</dd>
              </div>
            )}
            {activeVariants.length > 0 && (
              <div className="px-4 py-3">
                <dt className="text-muted-foreground">Sizes</dt>
                <dd className="mt-2">
                  <ul className="space-y-1.5">
                    {activeVariants.map((v) => (
                      <li key={v.id} className="flex justify-between gap-4">
                        <span>
                          {v.label}
                          <span className="text-muted-foreground"> · {formatBaseUnits(v.unitAmount, product.baseUnit)}</span>
                        </span>
                        <span className="tabular-nums font-semibold">{formatCents(effectivePrice(product, v.priceCents))}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {/* About the farm */}
      <section aria-labelledby="about-farm" className="shell mt-20">
        <div className="grid overflow-hidden rounded-lg border bg-card md:grid-cols-2">
          <div className="relative aspect-[16/10] bg-secondary md:aspect-auto md:min-h-[320px]">
            <SmartImage src={vendor.coverPhoto} alt={`${vendor.storeName}`} sizes="(min-width: 768px) 50vw, 100vw" />
          </div>
          <div className="flex flex-col justify-center p-7 sm:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-olive">About the farm</p>
            <h2 id="about-farm" className="mt-3 font-serif text-3xl font-medium tracking-[-0.015em]">
              {vendor.storeName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {place && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4 text-olive" />
                  {place}
                </span>
              )}
              {farm && farm.rating.count > 0 && <RatingSummary average={farm.rating.average} count={farm.rating.count} />}
            </div>
            {vendor.description && (
              <p className="mt-5 line-clamp-5 text-[15px] leading-relaxed text-foreground/85">{vendor.description}</p>
            )}
            <Link
              href={`/vendors/${vendor.id}`}
              className="group mt-7 inline-flex w-fit items-center gap-2 rounded-md border border-primary/30 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Visit the farm shop
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" aria-labelledby="reviews-heading" className="shell mt-20 scroll-mt-32">
        <ProductReviews productId={product.id} farmName={vendor.storeName} />
      </section>

      {moreFromFarm && moreFromFarm.items.length > 0 && (
        <section aria-labelledby="more-from-farm" className="shell mt-24">
          <SectionHeading
            id="more-from-farm"
            eyebrow="From the same farm"
            title={`More from ${vendor.storeName}`}
            link={{ href: `/vendors/${vendor.id}`, label: "Visit the farm shop" }}
          />
          <ProductGrid>
            {moreFromFarm.items.map((p) => (
              <ProductCard key={p.id} product={p} hideFarm />
            ))}
          </ProductGrid>
        </section>
      )}

      {alsoLike.length > 0 && (
        <section aria-labelledby="also-like" className="shell mt-24">
          <SectionHeading
            id="also-like"
            eyebrow={`More ${product.category.name.toLowerCase()}`}
            title="From other farms"
            link={{ href: `/products?category=${product.category.slug}`, label: `All ${product.category.name.toLowerCase()}` }}
          />
          <ProductGrid>
            {alsoLike.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ProductGrid>
        </section>
      )}

      <div className="mt-10 pb-12">
        <RecentlyViewed excludeId={product.id} />
      </div>

      <RecordRecentlyViewed
        product={{
          id: product.id,
          name: product.name,
          image: product.images[0]?.url ?? null,
          storeName: vendor.storeName,
          fromPriceCents: prices.length ? Math.min(...prices) : 0,
        }}
      />
      <ProductViewTracker productId={product.id} />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description ?? undefined,
          sku: product.id,
          url: `${SITE_URL}/products/${product.id}`,
          image: product.images.map((i) => i.url),
          category: product.category.name,
          brand: { "@type": "Brand", name: vendor.storeName },
          ...(prices.length > 0 && {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "AUD",
              lowPrice: (Math.min(...prices) / 100).toFixed(2),
              highPrice: (Math.max(...prices) / 100).toFixed(2),
              offerCount: activeVariants.length,
              availability:
                product.isActive && purchasable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              seller: { "@type": "Organization", name: vendor.storeName, url: `${SITE_URL}/vendors/${vendor.id}` },
            },
          }),
          ...(rating &&
            rating.count > 0 && {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: rating.average.toFixed(1),
                reviewCount: rating.count,
              },
            }),
        }}
      />
    </>
  )
}
