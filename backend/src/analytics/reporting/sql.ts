import { Prisma } from '@prisma/client';
import { Granularity, REPORTING_TIMEZONE } from './date-range';

/*
 * ───── Metric definitions (shared by vendor and admin analytics) ─────
 *
 * Every figure on both dashboards is derived from these rules so the two
 * never disagree:
 *
 * - Orders are dated by the parent Order.createdAt; VendorOrder has no
 *   timestamp of its own.
 * - A vendor order "counts" as a sale while its status is PAID, PROCESSING,
 *   SHIPPED or COMPLETED. CANCELLED and REFUNDED vendor orders are excluded
 *   from sales, commission and earnings everywhere.
 * - Gross sales (vendor) / GMV (marketplace) = SUM(VendorOrder.subtotalCents)
 *   of counted vendor orders. Merchandise only — shipping is excluded because
 *   it is passed through to the vendor in full.
 * - Commission = SUM(commissionCents) of counted vendor orders.
 * - Vendor net earnings = SUM(payoutCents) of counted vendor orders
 *   (subtotal − commission + shipping), i.e. what the vendor will be paid.
 * - Orders = counted vendor orders (vendor scope) or distinct parent orders
 *   with at least one counted vendor order (marketplace scope).
 * - AOV = gross sales ÷ orders (merchandise only, consistent with GMV).
 * - Items sold = SUM(OrderItem.quantity) — packs/variants, never base units,
 *   so grams, millilitres and pieces are never added together.
 * - Refunds = subtotal + shipping of every vendor order with refundedAt set,
 *   dated by refundedAt (when the money actually left). That covers both
 *   explicit refunds (status REFUNDED) and cancellations, which issue a Stripe
 *   refund but keep status CANCELLED.
 * - Promotion revenue = Promotion.priceCents dated by Promotion.createdAt.
 *   Promotions are created only after Stripe confirms payment and are never
 *   refunded, so every row is recognised revenue.
 * - Platform revenue = commission + promotion revenue. Vendor earnings and
 *   shipping are never platform revenue.
 *
 * Revenue is always read from Order/VendorOrder/Promotion rows, never from
 * Stripe webhook events, so webhook retries cannot double-count anything.
 */

export const COUNTED_STATUSES = [
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
] as const;
export const OPEN_STATUSES = ['PAID', 'PROCESSING'] as const;

export const COUNTED_SQL = Prisma.raw(
  `('PAID','PROCESSING','SHIPPED','COMPLETED')`,
);

const SAFE_TZ = /^[A-Za-z0-9_/+-]+$/;

function tzLiteral(tz: string) {
  if (!SAFE_TZ.test(tz)) throw new Error(`Unsafe timezone identifier: ${tz}`);
  return Prisma.raw(`'${tz}'`);
}

/** A UTC `timestamp` column converted to wall-clock time in the reporting timezone. */
export function localTs(column: string, tz = REPORTING_TIMEZONE) {
  return Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral(tz)})`;
}

/**
 * SQL expression producing the same bucket keys as `bucketKeys()` in
 * date-range.ts. Use with `GROUP BY 1` so the expression is not repeated.
 */
export function bucketKeySql(
  column: string,
  granularity: Granularity,
  tz = REPORTING_TIMEZONE,
) {
  const format = granularity === 'hour' ? 'YYYY-MM-DD HH24:00' : 'YYYY-MM-DD';
  return Prisma.sql`to_char(date_trunc(${Prisma.raw(`'${granularity}'`)}, ${localTs(column, tz)}), ${Prisma.raw(`'${format}'`)})`;
}

export function vendorFilter(
  vendorId: string | undefined,
  column = 'vo."vendorId"',
) {
  return vendorId
    ? Prisma.sql`AND ${Prisma.raw(column)} = ${vendorId}`
    : Prisma.empty;
}

/** Postgres returns bigint for COUNT/SUM and numeric for AVG — normalise to number. */
export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function safeDiv(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

/**
 * Percentage change from `previous` to `current`. Returns null when there is
 * no baseline (previous = 0) so the UI can show "new" instead of ∞%.
 */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function metric(current: number, previous: number) {
  return { value: current, previous, change: pctChange(current, previous) };
}

/** Zero-fill a keyed result set against the full list of bucket keys. */
export function fillSeries<T extends Record<string, number>>(
  keys: string[],
  rows: Array<{ bucket: string } & Record<string, unknown>>,
  fields: (keyof T & string)[],
): Array<{ bucket: string } & T> {
  const byKey = new Map(rows.map((r) => [r.bucket, r]));
  return keys.map((bucket) => {
    const row = byKey.get(bucket);
    const point: Record<string, number | string> = { bucket };
    for (const field of fields) point[field] = num(row?.[field]);
    return point as unknown as { bucket: string } & T;
  });
}
