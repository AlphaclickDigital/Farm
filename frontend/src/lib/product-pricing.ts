// Client counterpart of backend/src/products/product-pricing.ts — checkout
// validates the cart price against the same discounted number.

interface DiscountFields {
  discountName?: string | null
  discountCents?: number | null
  discountEndsAt?: string | null
}

export function hasActiveDiscount(product: DiscountFields) {
  return !!(
    product.discountName &&
    product.discountCents &&
    (!product.discountEndsAt || new Date(product.discountEndsAt) > new Date())
  )
}

/** The price a customer actually pays for one unit of a variant. */
export function effectivePrice(product: DiscountFields, priceCents: number) {
  return hasActiveDiscount(product) ? Math.max(0, priceCents - product.discountCents!) : priceCents
}

/** Whole units of a variant the shared product stock can still cover. */
export function maxUnits(stockAmount: number, unitAmount: number) {
  return unitAmount > 0 ? Math.floor(stockAmount / unitAmount) : 0
}
