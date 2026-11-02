import Link from "next/link"
import { SmartImage } from "@/components/storefront/smart-image"
import { RatingSummary } from "@/components/storefront/rating"
import { QuickAdd } from "@/components/storefront/quick-add"
import { effectivePrice, hasActiveDiscount, maxUnits } from "@/lib/product-pricing"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CatalogVariant } from "@/lib/storefront"

export interface ProductCardData {
  id: string
  name: string
  stockAmount: number
  discountName?: string | null
  discountCents?: number | null
  discountEndsAt?: string | null
  variants: CatalogVariant[]
  images?: { url: string }[]
  category?: { name: string; slug?: string } | null
  vendor?: { id: string; storeName: string; location?: string | null; state?: string | null } | null
  rating?: { average: number; count: number }
  isFeatured?: boolean
}

interface ProductCardProps {
  product: ProductCardData
  className?: string
  /** Hide the farm line, e.g. on that farm's own storefront. */
  hideFarm?: boolean
  priority?: boolean
}

const LOW_STOCK_UNITS = 5

export function ProductCard({ product, className, hideFarm, priority }: ProductCardProps) {
  const variants = product.variants.filter((v) => v.isActive)
  const href = `/products/${product.id}`
  const discounted = hasActiveDiscount(product)
  const prices = variants.map((v) => v.priceCents)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const purchasable = variants.filter((v) => maxUnits(product.stockAmount, v.unitAmount) >= 1)
  // Units left of the smallest size — the most the shared stock can cover.
  const unitsLeft = purchasable.length
    ? Math.max(...purchasable.map((v) => maxUnits(product.stockAmount, v.unitAmount)))
    : 0
  const soldOut = purchasable.length === 0

  return (
    <article className={cn("group flex flex-col", className)}>
      <Link
        href={href}
        className="relative block aspect-square overflow-hidden rounded-md bg-secondary"
        tabIndex={-1}
        aria-hidden="true"
      >
        <SmartImage
          src={product.images?.[0]?.url}
          alt=""
          sizes="(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw"
          priority={priority}
          className={cn(
            "transition-transform duration-700 ease-out group-hover:scale-[1.035]",
            soldOut && "grayscale-[60%]"
          )}
        />
        <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {discounted && (
            <span className="rounded-sm bg-terracotta px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-terracotta-foreground">
              {product.discountName}
            </span>
          )}
          {product.isFeatured && (
            <span className="rounded-sm bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground backdrop-blur-sm">
              Sponsored
            </span>
          )}
        </span>
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/75 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-background">
            Sold out
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col pt-3">
        {!hideFarm && product.vendor && (
          <Link
            href={`/vendors/${product.vendor.id}`}
            className="truncate text-xs font-semibold text-olive hover:text-primary hover:underline"
          >
            {product.vendor.storeName}
          </Link>
        )}
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
          <Link href={href} className="hover:text-primary">
            {product.name}
          </Link>
        </h3>
        {variants.length > 0 && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {variants.map((v) => v.label).join(" · ")}
          </p>
        )}
        {product.rating && product.rating.count > 0 && (
          <RatingSummary className="mt-1.5" average={product.rating.average} count={product.rating.count} />
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
              {variants.length > 1 && <span className="text-xs text-muted-foreground">From</span>}
              <span className={cn("text-base font-bold tabular-nums", discounted && "text-terracotta")}>
                {formatCents(effectivePrice(product, minPrice))}
              </span>
              {discounted && (
                <span className="text-xs text-muted-foreground line-through tabular-nums">
                  {formatCents(minPrice)}
                </span>
              )}
            </p>
            {!soldOut && unitsLeft <= LOW_STOCK_UNITS && (
              <p className="mt-0.5 text-[11px] font-semibold text-terracotta">Only {unitsLeft} left</p>
            )}
          </div>
          {product.vendor ? (
            <QuickAdd product={{ ...product, vendor: product.vendor }} />
          ) : (
            <Link href={href} className="text-[13px] font-semibold text-primary hover:underline">
              View
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4", className)}>
      {children}
    </div>
  )
}
