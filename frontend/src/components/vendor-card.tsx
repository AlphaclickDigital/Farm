import Link from "next/link"
import { ArrowRight, MapPin } from "lucide-react"
import { SmartImage } from "@/components/storefront/smart-image"
import { RatingSummary } from "@/components/storefront/rating"
import { farmPlace } from "@/lib/storefront"
import { cn } from "@/lib/utils"

interface VendorCardVendor {
  id: string
  storeName: string
  description?: string | null
  photo?: string | null
  coverPhoto?: string | null
  location?: string | null
  state?: string | null
  productCount?: number
  rating?: { average: number; count: number }
  categories?: { name: string; slug: string }[]
  isFeatured?: boolean
  _count?: { products: number; reviews: number }
}

interface VendorCardProps {
  vendor: VendorCardVendor
  className?: string
}

export function VendorCard({ vendor, className }: VendorCardProps) {
  const href = `/vendors/${vendor.id}`
  const place = farmPlace(vendor)
  const productCount = vendor.productCount ?? vendor._count?.products ?? 0

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card transition-shadow hover:shadow-[0_12px_32px_-18px_rgb(43_33_24/0.35)]",
        className
      )}
    >
      <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-[16/9] bg-secondary">
        <SmartImage
          src={vendor.coverPhoto}
          alt=""
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
        {vendor.isFeatured && (
          <span className="absolute right-3 top-3 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground backdrop-blur-sm">
            Sponsored
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="relative -mt-8 h-16 w-16 overflow-hidden rounded-full border-4 border-card bg-secondary">
          <SmartImage src={vendor.photo} alt="" sizes="64px" />
        </div>

        <h3 className="mt-3 font-serif text-xl font-medium leading-tight tracking-[-0.01em]">
          <Link href={href} className="hover:text-primary">
            {vendor.storeName}
          </Link>
        </h3>
        {place && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-olive" />
            {place}
          </p>
        )}
        {vendor.description && (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{vendor.description}</p>
        )}
        {vendor.categories && vendor.categories.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Sells">
            {vendor.categories.slice(0, 3).map((c) => (
              <li key={c.slug} className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {c.name}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-3">
            {vendor.rating && vendor.rating.count > 0 && (
              <RatingSummary average={vendor.rating.average} count={vendor.rating.count} />
            )}
            <span>
              {productCount} {productCount === 1 ? "product" : "products"}
            </span>
          </span>
          <Link
            href={href}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            aria-label={`Visit ${vendor.storeName}`}
          >
            Visit farm
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  )
}
