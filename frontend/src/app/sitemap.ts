import type { MetadataRoute } from "next"
import { API_URL, SITE_URL, getFarms, getOverview } from "@/lib/storefront"

// Rebuilt at most hourly; products and farms come from the public catalog.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [overview, farms, products] = await Promise.all([
    getOverview(),
    getFarms(),
    fetch(`${API_URL}/products`, { next: { revalidate: 3600 } })
      .then((res) => (res.ok ? (res.json() as Promise<{ id: string; updatedAt: string }[]>) : []))
      .catch(() => []),
  ])

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/vendors`, changeFrequency: "weekly", priority: 0.8 },
    ...(overview?.categories ?? []).map((c) => ({
      url: `${SITE_URL}/products?category=${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...(farms?.items ?? []).map((f) => ({
      url: `${SITE_URL}/vendors/${f.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}/products/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ]
}
