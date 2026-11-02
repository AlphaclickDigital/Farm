// Shared types, navigation config and server-side fetchers for the public
// storefront. Safe to import from both server and client components.

export const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")
export const SITE_NAME = "FarmMarket"

// ───── Types (mirror backend/src/storefront/storefront.service.ts) ─────

export interface CatalogVariant {
  id: string
  label: string
  unitAmount: number
  priceCents: number
  isActive: boolean
}

export interface CatalogProduct {
  id: string
  name: string
  slug: string
  baseUnit: string
  stockAmount: number
  discountName: string | null
  discountCents: number | null
  discountEndsAt: string | null
  createdAt: string
  category: { id: string; name: string; slug: string }
  vendor: { id: string; storeName: string; location: string | null; state: string | null }
  images: { id: string; url: string }[]
  variants: CatalogVariant[]
  fromPriceCents: number
  inStock: boolean
  isFeatured: boolean
  rating: { average: number; count: number }
}

export interface CatalogFacets {
  categories: { slug: string; name: string; count: number }[]
  farms: { id: string; storeName: string; count: number }[]
  states: { code: string; count: number }[]
  price: { min: number; max: number } | null
  rating: { 4: number; 3: number }
  inStock: number
  onSale: number
  featured: number
}

export interface CatalogResponse {
  items: CatalogProduct[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  facets: CatalogFacets
}

export interface FarmSummary {
  id: string
  storeName: string
  description: string | null
  photo: string | null
  coverPhoto: string | null
  location: string | null
  state: string | null
  createdAt: string
  productCount: number
  rating: { average: number; count: number }
  categories: { id: string; name: string; slug: string; count: number }[]
  isFeatured: boolean
}

export interface FarmProfile extends FarmSummary {
  phone: string | null
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number>
}

export interface FarmsResponse {
  items: FarmSummary[]
  total: number
  states: { code: string; count: number }[]
}

export interface StorefrontOverview {
  announcement: string[]
  stats: { farms: number; products: number; states: number }
  categories: { id: string; name: string; slug: string; productCount: number; image: string | null }[]
  states: { code: string; count: number }[]
}

export interface SearchSuggestions {
  products: {
    id: string
    name: string
    image: string | null
    category: string
    storeName: string
    fromPriceCents: number
  }[]
  farms: { id: string; storeName: string; location: string | null; state: string | null; photo: string | null }[]
  categories: { name: string; slug: string }[]
}

export interface ShippingOptionPublic {
  id: string
  name: string
  description: string | null
  type: "FLAT_RATE" | "WEIGHT_BASED" | "PICKUP"
  flatRateCents: number | null
  minOrderCents: number | null
  estimatedDays: string
  weightTiers?: { minGrams: number; maxGrams: number | null; priceCents: number }[]
}

// ───── Sorting (shared by server pages and client controls) ─────

export const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "best-selling", label: "Best selling" },
  { value: "top-rated", label: "Highest rated" },
] as const

export const FARM_SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "top-rated", label: "Highest rated" },
  { value: "products", label: "Most products" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name (A–Z)" },
] as const

// ───── Navigation ─────

/**
 * Customer-facing departments, each a group of admin-managed category slugs.
 * Slugs that don't exist (or have no products) are dropped at render time,
 * so a category an admin adds later still appears under "Shop all".
 */
export const DEPARTMENTS = [
  { label: "Meat & Poultry", categories: ["beef", "lamb", "pork", "chicken", "meat"] },
  { label: "Eggs & Dairy", categories: ["eggs", "dairy"] },
  { label: "Fruit & Vegetables", categories: ["fruits", "vegetable", "vegetables", "organic-produce", "herbs"] },
  { label: "Pantry & Honey", categories: ["honey", "farm-produce", "grains"] },
  { label: "Seafood", categories: ["seafood"] },
] as const

export function departmentLinks(available: { slug: string }[]) {
  const slugs = new Set(available.map((c) => c.slug))
  return DEPARTMENTS.map((d) => ({
    label: d.label,
    categories: d.categories.filter((s) => slugs.has(s)),
  }))
    .filter((d) => d.categories.length > 0)
    .map((d) => ({ ...d, href: `/products?category=${d.categories.join(",")}` }))
}

/** The department whose (available) categories exactly match a `category` param. */
export function departmentFor(categoryParam: string | undefined, available: { slug: string }[]) {
  if (!categoryParam) return null
  const selected = [...new Set(categoryParam.split(",").filter(Boolean))].sort().join(",")
  return departmentLinks(available).find((d) => [...d.categories].sort().join(",") === selected) ?? null
}

export const AU_STATES = [
  { code: "NSW", name: "New South Wales" },
  { code: "VIC", name: "Victoria" },
  { code: "QLD", name: "Queensland" },
  { code: "SA", name: "South Australia" },
  { code: "WA", name: "Western Australia" },
  { code: "TAS", name: "Tasmania" },
  { code: "NT", name: "Northern Territory" },
  { code: "ACT", name: "Australian Capital Territory" },
] as const

export function stateName(code: string | null | undefined) {
  return AU_STATES.find((s) => s.code === code)?.name ?? code ?? ""
}

export function farmPlace(farm: { location?: string | null; state?: string | null }) {
  return [farm.location, farm.state].filter(Boolean).join(", ")
}

// ───── Server fetchers ─────

type FetchOptions = { revalidate?: number }

async function storefrontGet<T>(path: string, { revalidate }: FetchOptions = {}): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, revalidate ? { next: { revalidate } } : { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function getOverview() {
  return storefrontGet<StorefrontOverview>("/storefront/overview", { revalidate: 120 })
}

export function catalogQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue
    search.set(key, String(value))
  }
  const str = search.toString()
  return str ? `?${str}` : ""
}

export function getCatalog(params: Record<string, string | number | boolean | undefined | null>) {
  return storefrontGet<CatalogResponse>(`/storefront/catalog${catalogQuery(params)}`)
}

export function getFarms(params: { q?: string; state?: string; sort?: string } = {}) {
  return storefrontGet<FarmsResponse>(`/storefront/farms${catalogQuery(params)}`)
}

export function getFarm(id: string) {
  return storefrontGet<FarmProfile>(`/storefront/farms/${encodeURIComponent(id)}`)
}

export function getShippingOptions(vendorId: string) {
  return storefrontGet<ShippingOptionPublic[]>(`/vendors/${encodeURIComponent(vendorId)}/shipping`, { revalidate: 60 })
}
