"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { SmartImage } from "@/components/storefront/smart-image"
import { formatCents } from "@/lib/format"
import { readStored, useStoredValue, writeStored } from "@/lib/use-local-storage"

const KEY = "farm-recently-viewed"
const MAX = 12

export interface ViewedProduct {
  id: string
  name: string
  image: string | null
  storeName: string
  fromPriceCents: number
}

const NONE: ViewedProduct[] = []

function read(): ViewedProduct[] {
  const value = readStored<unknown>(KEY, NONE)
  return Array.isArray(value) ? (value as ViewedProduct[]) : NONE
}

/** Records a product view in this browser (nothing is sent anywhere). */
export function RecordRecentlyViewed({ product }: { product: ViewedProduct }) {
  useEffect(() => {
    writeStored(KEY, [product, ...read().filter((p) => p.id !== product.id)].slice(0, MAX))
  }, [product])
  return null
}

export function RecentlyViewed({ excludeId, title = "Recently viewed" }: { excludeId?: string; title?: string }) {
  const stored = useStoredValue<ViewedProduct[]>(KEY, NONE)
  const items = useMemo(
    () => (Array.isArray(stored) ? stored.filter((p) => p && p.id !== excludeId) : NONE),
    [stored, excludeId]
  )

  if (items.length === 0) return null

  return (
    <section aria-labelledby="recently-viewed" className="shell py-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 id="recently-viewed" className="font-serif text-2xl font-medium tracking-[-0.01em]">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => writeStored(KEY, null)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Clear history
        </button>
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 sm:scroll-px-6 lg:scroll-px-0 pb-2 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {items.map((p) => (
          <li key={p.id} className="w-36 shrink-0 snap-start sm:w-44">
            <Link href={`/products/${p.id}`} className="group block">
              <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
                <SmartImage
                  src={p.image}
                  alt=""
                  sizes="176px"
                  className="transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </div>
              <p className="mt-2 truncate text-xs text-olive">{p.storeName}</p>
              <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">{p.name}</p>
              <p className="mt-0.5 text-sm tabular-nums">{formatCents(p.fromPriceCents)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
