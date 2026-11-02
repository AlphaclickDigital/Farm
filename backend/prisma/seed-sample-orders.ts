/**
 * Sample ORDER history for local development and dashboard QA.
 *
 * Builds roughly a year of realistic marketplace activity on top of the
 * sample vendors from seed-sample-data.ts: shoppers, multi-vendor orders in
 * every fulfilment state, cancellations and refunds, reviews (some with
 * vendor replies), completed payouts, featured-listing purchases and a few
 * failed card payments.
 *
 * Everything it creates is identifiable and removable:
 *   - shoppers:        sample.shopper.<n>@example.com (no password; can't log in)
 *   - orders:          Order.stripePaymentId      starts with "pi_sample_order_"
 *   - promotions:      Promotion.stripePaymentId  starts with "pi_sample_promo_"
 *   - payouts:         Payout.stripeTransferId    starts with "tr_sample_"
 *   - failed payments: PaymentIncident.stripeObjectId starts with "pi_sample_failed_"
 *   - stock deducted for recent orders is recorded in the Configuration row
 *     "sample_orders_seed" and restored exactly by --remove.
 *
 * None of these ids exist in Stripe, so refunding or cancelling a sample
 * order from the dashboard will fail at the Stripe call (the order is left
 * unchanged). Only @example.com vendors are used; the e2e.vendor.* fixtures
 * and any real accounts are never touched.
 *
 *   npm run seed:orders              # create (refuses if already seeded)
 *   npm run seed:orders -- --remove  # delete everything listed above
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { OrderStatus, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const ORDER_PREFIX = 'pi_sample_order_';
const PROMO_PREFIX = 'pi_sample_promo_';
const TRANSFER_PREFIX = 'tr_sample_';
const FAILED_PREFIX = 'pi_sample_failed_';
const SHOPPER_PATTERN = /^sample\.shopper\.\d+@example\.com$/;
const MARKER_KEY = 'sample_orders_seed';

const SHOPPER_COUNT = 42;
const ORDER_COUNT = 340;
const DAYS_OF_HISTORY = 365;
// Stock is only deducted for this recent window; older sales are assumed
// to have been restocked since, which keeps the sample catalogue sellable.
const STOCK_WINDOW_DAYS = 45;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Deterministic PRNG so every run produces the same history shape.
let seed = 20261031;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
function weighted<T>(entries: [T, number][]) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of entries) {
    if ((r -= weight) <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

const DAY = 86_400_000;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

const FIRST_NAMES = ['Olivia', 'Jack', 'Charlotte', 'Noah', 'Amelia', 'William', 'Isla', 'Oliver', 'Mia', 'Thomas',
  'Ava', 'James', 'Grace', 'Lucas', 'Chloe', 'Henry', 'Zoe', 'Leo', 'Ruby', 'Archie', 'Sophie', 'Harrison',
  'Matilda', 'Hugo', 'Ella', 'Cooper', 'Evie', 'Lachlan', 'Willow', 'Riley'];
const LAST_NAMES = ['Smith', 'Nguyen', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Johnson', 'White', 'Martin',
  'Anderson', 'Thompson', 'Walker', 'Harris', 'Lee', 'Ryan', "O'Brien", 'Kelly', 'Murphy', 'Chen', 'Patel'];
const STATES: [string, number][] = [['NSW', 32], ['VIC', 26], ['QLD', 20], ['WA', 9], ['SA', 7], ['TAS', 3], ['ACT', 2], ['NT', 1]];
const CITIES: Record<string, string[]> = {
  NSW: ['Sydney', 'Newcastle', 'Wollongong', 'Orange'],
  VIC: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo'],
  QLD: ['Brisbane', 'Gold Coast', 'Toowoomba', 'Cairns'],
  WA: ['Perth', 'Fremantle', 'Bunbury'],
  SA: ['Adelaide', 'Mount Gambier'],
  TAS: ['Hobart', 'Launceston'],
  ACT: ['Canberra'],
  NT: ['Darwin'],
};
const REVIEW_TEXT: Record<number, string[]> = {
  5: ['Absolutely beautiful produce, will be ordering again.', 'Fresh, well packed and arrived quickly.', 'Best we have had in years. Thank you!'],
  4: ['Really good quality, delivery took a day longer than expected.', 'Lovely flavour, a little pricey but worth it.'],
  3: ['Decent, but not as fresh as I hoped.', 'Okay overall. Packaging could be better.'],
  2: ['Arrived a bit bruised. Disappointed.', 'Smaller than pictured.'],
  1: ['Arrived spoiled, had to throw it out.'],
};

async function remove() {
  const orders = await prisma.order.findMany({
    where: { stripePaymentId: { startsWith: ORDER_PREFIX } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  const vendorOrders = await prisma.vendorOrder.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const voIds = vendorOrders.map((v) => v.id);
  const shoppers = (await prisma.user.findMany({ select: { id: true, email: true } })).filter((u) =>
    SHOPPER_PATTERN.test(u.email),
  );
  const shopperIds = shoppers.map((s) => s.id);
  const marker = await prisma.configuration.findUnique({ where: { key: MARKER_KEY } });

  await prisma.$transaction(
    async (tx) => {
      await tx.vendorOrder.updateMany({ where: { id: { in: voIds } }, data: { payoutId: null } });
      await tx.payout.deleteMany({ where: { stripeTransferId: { startsWith: TRANSFER_PREFIX } } });
      await tx.review.deleteMany({ where: { userId: { in: shopperIds } } });
      await tx.orderItem.deleteMany({ where: { vendorOrderId: { in: voIds } } });
      await tx.vendorOrder.deleteMany({ where: { id: { in: voIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      await tx.promotion.deleteMany({ where: { stripePaymentId: { startsWith: PROMO_PREFIX } } });
      await tx.paymentIncident.deleteMany({ where: { stripeObjectId: { startsWith: FAILED_PREFIX } } });
      await tx.user.deleteMany({ where: { id: { in: shopperIds } } });

      if (marker) {
        const deducted = JSON.parse(marker.value) as Record<string, number>;
        for (const [productId, amount] of Object.entries(deducted)) {
          await tx.product.updateMany({
            where: { id: productId },
            data: { stockAmount: { increment: amount } },
          });
        }
        await tx.configuration.delete({ where: { key: MARKER_KEY } });
      }
    },
    { timeout: 120_000 },
  );
  console.log(
    `Removed ${orderIds.length} sample orders, ${shopperIds.length} shoppers` +
      (marker ? ', and restored deducted stock.' : '.'),
  );
}

function rollup(statuses: OrderStatus[]): OrderStatus {
  const active = statuses.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) return 'CANCELLED';
  if (active.every((s) => s === 'REFUNDED')) return 'REFUNDED';
  if (active.every((s) => s === 'COMPLETED' || s === 'REFUNDED')) return 'COMPLETED';
  if (active.every((s) => ['SHIPPED', 'COMPLETED', 'REFUNDED'].includes(s))) return 'SHIPPED';
  if (active.every((s) => ['PROCESSING', 'SHIPPED', 'COMPLETED', 'REFUNDED'].includes(s))) return 'PROCESSING';
  return 'PAID';
}

function statusForAge(ageDays: number): OrderStatus {
  if (ageDays < 2) return 'PROCESSING';
  if (ageDays < 6) return weighted<OrderStatus>([['PROCESSING', 5], ['SHIPPED', 5]]);
  if (ageDays < 14) return weighted<OrderStatus>([['SHIPPED', 7], ['COMPLETED', 3]]);
  return weighted<OrderStatus>([['COMPLETED', 90], ['CANCELLED', 5], ['REFUNDED', 5]]);
}

async function create() {
  if (await prisma.order.findFirst({ where: { stripePaymentId: { startsWith: ORDER_PREFIX } } })) {
    console.log('Sample orders already exist. Run with --remove first to regenerate.');
    return;
  }

  const vendors = await prisma.vendor.findMany({
    where: {
      isApproved: true,
      isSuspended: false,
      user: { email: { endsWith: '@example.com', not: { startsWith: 'e2e.' } } },
    },
    include: {
      shippingOptions: { where: { isActive: true }, include: { weightTiers: true } },
      products: {
        where: { isActive: true },
        include: { variants: { where: { isActive: true } } },
      },
    },
  });
  const usable = vendors.filter((v) => v.products.some((p) => p.variants.length));
  if (usable.length === 0) {
    console.log('No sample vendors found. Run `npm run seed:sample` first.');
    return;
  }

  const commissionConfig = await prisma.configuration.findUnique({ where: { key: 'commission_rate' } });
  const commissionRate = commissionConfig ? parseFloat(commissionConfig.value) || 0.1 : 0.1;

  // ── Shoppers: registrations spread across the year, a few recent ones.
  const shoppers = Array.from({ length: SHOPPER_COUNT }, (_, i) => {
    const state = weighted(STATES);
    return {
      id: randomUUID(),
      email: `sample.shopper.${i + 1}@example.com`,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      role: 'CUSTOMER' as const,
      createdAt: daysAgo(i < 34 ? between(30, DAYS_OF_HISTORY + 20) : between(0, 29)),
      state,
      city: pick(CITIES[state]),
      // Zipf-ish loyalty: a handful of regulars place most repeat orders.
      weight: 1 / (i + 1) ** 0.8,
    };
  });
  await prisma.user.createMany({
    data: shoppers.map(({ id, email, name, role, createdAt }) => ({ id, email, name, role, createdAt, updatedAt: createdAt })),
  });

  const orders: Array<{ id: string; createdAt: Date } & Record<string, unknown>> = [];
  const vendorOrders: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const deducted: Record<string, number> = {};
  const stock = new Map(usable.flatMap((v) => v.products.map((p) => [p.id, p.stockAmount] as const)));
  const completedPurchases: { userId: string; productId: string; vendorId: string; date: Date }[] = [];

  for (let n = 0; n < ORDER_COUNT; n++) {
    // Skew toward recent days so the marketplace looks like it's growing.
    const ageDays = Math.floor(DAYS_OF_HISTORY * rand() ** 1.6);
    const createdAt = new Date(daysAgo(ageDays).getTime() - between(0, 20) * 3_600_000);
    const eligible = shoppers.filter((s) => s.createdAt <= createdAt);
    if (eligible.length === 0) continue;
    const shopper = weighted(eligible.map((s) => [s, s.weight] as [typeof s, number]));

    const vendorCount = weighted([[1, 75], [2, 20], [3, 5]]);
    const chosen = [...usable].sort(() => rand() - 0.5).slice(0, vendorCount);
    const orderId = randomUUID();
    let orderTotal = 0;
    let orderShipping = 0;
    const statuses: OrderStatus[] = [];

    for (const vendor of chosen) {
      const voId = randomUUID();
      const status = statusForAge(ageDays);
      const lines = [...vendor.products.filter((p) => p.variants.length)]
        .sort(() => rand() - 0.5)
        .slice(0, weighted([[1, 50], [2, 35], [3, 15]]));
      let subtotal = 0;
      const voItems: Record<string, unknown>[] = [];
      for (const product of lines) {
        const variant = pick(product.variants);
        const quantity = weighted([[1, 60], [2, 30], [3, 10]]);
        const needed = variant.unitAmount * quantity;
        const consumesStock = ageDays < STOCK_WINDOW_DAYS && status !== 'CANCELLED' && status !== 'REFUNDED';
        if (consumesStock) {
          const available = stock.get(product.id) ?? 0;
          if (available < needed) continue;
          stock.set(product.id, available - needed);
          deducted[product.id] = (deducted[product.id] ?? 0) + needed;
        }
        subtotal += variant.priceCents * quantity;
        voItems.push({
          id: randomUUID(),
          vendorOrderId: voId,
          productId: product.id,
          variantId: variant.id,
          quantity,
          priceCents: variant.priceCents,
        });
        if (status === 'COMPLETED') {
          completedPurchases.push({ userId: shopper.id, productId: product.id, vendorId: vendor.id, date: createdAt });
        }
      }
      if (voItems.length === 0) continue;

      const option = vendor.shippingOptions[0];
      let shipping = 0;
      if (option?.type === 'FLAT_RATE') shipping = option.flatRateCents ?? 0;
      if (option?.type === 'WEIGHT_BASED') shipping = option.weightTiers[0]?.priceCents ?? 900;
      if (option?.minOrderCents && subtotal >= option.minOrderCents) shipping = 0;

      const commission = Math.round(subtotal * commissionRate);
      const shipped = ['SHIPPED', 'COMPLETED'].includes(status) && option?.type !== 'PICKUP';
      const refundedAt =
        status === 'CANCELLED'
          ? new Date(createdAt.getTime() + DAY)
          : status === 'REFUNDED'
            ? new Date(Math.min(createdAt.getTime() + between(3, 10) * DAY, now.getTime() - DAY))
            : null;

      vendorOrders.push({
        id: voId,
        orderId,
        vendorId: vendor.id,
        subtotalCents: subtotal,
        commissionCents: commission,
        payoutCents: subtotal - commission + shipping,
        shippingCents: shipping,
        shippingMethod: option?.name ?? null,
        shippingOptionId: option?.id ?? null,
        status,
        trackingNumber: shipped ? `SAMPLE${between(100000000, 999999999)}` : null,
        refundedAt,
        stripeRefundId: refundedAt ? `re_sample_${voId.slice(0, 8)}` : null,
      });
      items.push(...voItems);
      statuses.push(status);
      orderTotal += subtotal + shipping;
      orderShipping += shipping;
    }
    if (statuses.length === 0) continue;

    orders.push({
      id: orderId,
      userId: shopper.id,
      stripePaymentId: `${ORDER_PREFIX}${orderId.replace(/-/g, '').slice(0, 20)}`,
      totalAmountCents: orderTotal,
      shippingCents: orderShipping,
      status: rollup(statuses),
      shippingName: shopper.name,
      shippingAddress: `${between(1, 240)} Sample Street`,
      shippingCity: shopper.city,
      shippingState: shopper.state,
      shippingZip: String(between(2000, 7999)),
      createdAt,
    });
  }

  // ── Payouts: each vendor has been paid for completed orders older than 45 days.
  const payouts: Record<string, unknown>[] = [];
  const orderDate = new Map(orders.map((o) => [o.id, o.createdAt]));
  for (const vendor of usable) {
    const eligible = vendorOrders.filter(
      (vo) =>
        vo.vendorId === vendor.id &&
        vo.status === 'COMPLETED' &&
        (orderDate.get(vo.orderId as string) ?? now) < daysAgo(45),
    );
    if (eligible.length === 0) continue;
    const payoutId = randomUUID();
    const amount = eligible.reduce((s, vo) => s + (vo.payoutCents as number), 0);
    const completedAt = daysAgo(between(32, 44));
    payouts.push({
      id: payoutId,
      vendorId: vendor.id,
      amountCents: amount,
      status: 'COMPLETED',
      stripeTransferId: `${TRANSFER_PREFIX}${payoutId.slice(0, 12)}`,
      initiatedBy: 'VENDOR',
      createdAt: completedAt,
      completedAt,
    });
    for (const vo of eligible) vo.payoutId = payoutId;
  }

  // ── Reviews on roughly a third of completed purchases.
  const seen = new Set<string>();
  const reviews: Record<string, unknown>[] = [];
  for (const purchase of completedPurchases) {
    const key = `${purchase.userId}:${purchase.productId}`;
    if (seen.has(key) || rand() > 0.35) continue;
    seen.add(key);
    const rating = weighted([[5, 45], [4, 30], [3, 12], [2, 8], [1, 5]]);
    const createdAt = new Date(Math.min(purchase.date.getTime() + between(4, 12) * DAY, now.getTime() - 3_600_000));
    const replied = rand() < 0.4;
    reviews.push({
      id: randomUUID(),
      userId: purchase.userId,
      productId: purchase.productId,
      vendorId: purchase.vendorId,
      rating,
      comment: pick(REVIEW_TEXT[rating]),
      createdAt,
      vendorReply: replied ? (rating >= 4 ? 'Thank you so much, we love hearing this!' : "Sorry to hear that. We've been in touch to make it right.") : null,
      vendorRepliedAt: replied ? new Date(Math.min(createdAt.getTime() + DAY, now.getTime())) : null,
    });
  }

  // ── Featured-listing purchases over the last four months.
  const promotions: Record<string, unknown>[] = [];
  for (let i = 0; i < 16; i++) {
    const vendor = pick(usable);
    const product = pick(vendor.products);
    const featuredStore = rand() < 0.2;
    const startDate = daysAgo(between(0, 120));
    const endDate = new Date(startDate.getTime() + 7 * DAY);
    promotions.push({
      id: randomUUID(),
      vendorId: vendor.id,
      productId: featuredStore ? null : product.id,
      type: featuredStore ? 'FEATURED_VENDOR' : 'FEATURED_PRODUCT',
      status: endDate < now ? 'EXPIRED' : 'ACTIVE',
      startDate,
      endDate,
      priceCents: 2000,
      stripePaymentId: `${PROMO_PREFIX}${i + 1}`,
      createdAt: startDate,
    });
  }

  // ── A few declined cards in the last three weeks.
  const incidents = Array.from({ length: 9 }, (_, i) => ({
    type: 'PAYMENT_FAILED' as const,
    stripeObjectId: `${FAILED_PREFIX}${i + 1}`,
    paymentIntentId: `${FAILED_PREFIX}${i + 1}`,
    amountCents: between(1800, 14000),
    status: pick(['card_declined', 'insufficient_funds', 'expired_card']),
    reason: 'Your card was declined.',
    createdAt: daysAgo(between(0, 20)),
  }));

  await prisma.$transaction(
    async (tx) => {
      await tx.order.createMany({ data: orders as never });
      await tx.payout.createMany({ data: payouts as never });
      await tx.vendorOrder.createMany({ data: vendorOrders as never });
      await tx.orderItem.createMany({ data: items as never });
      await tx.review.createMany({ data: reviews as never });
      await tx.promotion.createMany({ data: promotions as never });
      await tx.paymentIncident.createMany({ data: incidents });
      for (const [productId, amount] of Object.entries(deducted)) {
        await tx.product.update({ where: { id: productId }, data: { stockAmount: { decrement: amount } } });
      }
      await tx.configuration.create({
        data: {
          key: MARKER_KEY,
          value: JSON.stringify(deducted),
          description: 'Stock deducted by prisma/seed-sample-orders.ts; restored by --remove. Safe to ignore.',
        },
      });
    },
    { timeout: 120_000 },
  );

  console.log(
    `Created ${shoppers.length} shoppers, ${orders.length} orders (${vendorOrders.length} vendor orders), ` +
      `${payouts.length} payouts, ${reviews.length} reviews, ${promotions.length} promotions, ` +
      `${incidents.length} failed payments across ${usable.length} vendors.`,
  );
}

(process.argv.includes('--remove') ? remove() : create())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
