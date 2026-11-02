// Server-side counterpart of frontend/src/lib/product-pricing.ts. The
// storefront shows (and puts in the cart) the discounted price, so checkout
// must validate against the same number — keep the two in sync.

interface DiscountableProduct {
  discountName: string | null;
  discountCents: number | null;
  discountEndsAt: Date | null;
}

export function hasActiveDiscount(
  product: DiscountableProduct,
  now = new Date(),
) {
  return !!(
    product.discountName &&
    product.discountCents &&
    (!product.discountEndsAt || product.discountEndsAt > now)
  );
}

export function effectivePriceCents(
  product: DiscountableProduct,
  variant: { priceCents: number },
  now = new Date(),
) {
  const discount = hasActiveDiscount(product, now) ? product.discountCents! : 0;
  return Math.max(0, variant.priceCents - discount);
}
