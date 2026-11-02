import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResolvedRange,
  bucketKeys,
  previousBucketKeys,
} from '../reporting/date-range';
import {
  COUNTED_SQL,
  bucketKeySql,
  fillSeries,
  num,
  safeDiv,
  vendorFilter,
} from '../reporting/sql';

/** Optional vendor restriction. Omitted = marketplace-wide (admin only). */
export interface Scope {
  vendorId?: string;
}

export interface SalesTotals {
  gross: number;
  commission: number;
  earnings: number;
  shipping: number;
  orders: number;
  items: number;
  customers: number;
  aov: number;
}

export interface SeriesPoint {
  bucket: string;
  gross: number;
  commission: number;
  earnings: number;
  orders: number;
  items: number;
}

const AU_STATES: Record<string, string> = {
  'NEW SOUTH WALES': 'NSW',
  VICTORIA: 'VIC',
  QUEENSLAND: 'QLD',
  'SOUTH AUSTRALIA': 'SA',
  'WESTERN AUSTRALIA': 'WA',
  TASMANIA: 'TAS',
  'NORTHERN TERRITORY': 'NT',
  'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
};
export const STATE_CODES = [
  'NSW',
  'VIC',
  'QLD',
  'SA',
  'WA',
  'TAS',
  'NT',
  'ACT',
];

/** Free-text state entries ("vic", "Victoria", " NSW ") → canonical code or "Unknown". */
export function normaliseState(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  const upper = raw.trim().toUpperCase().replace(/\./g, '');
  if (STATE_CODES.includes(upper)) return upper;
  return AU_STATES[upper] ?? 'Unknown';
}

@Injectable()
export class SalesAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async totals(scope: Scope, from: Date, to: Date): Promise<SalesTotals> {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE(SUM(vo."subtotalCents"), 0)::bigint   AS gross,
        COALESCE(SUM(vo."commissionCents"), 0)::bigint AS commission,
        COALESCE(SUM(vo."payoutCents"), 0)::bigint     AS earnings,
        COALESCE(SUM(vo."shippingCents"), 0)::bigint   AS shipping,
        COALESCE(SUM(it.qty), 0)::bigint               AS items,
        COUNT(DISTINCT vo."orderId")::int              AS orders,
        COUNT(DISTINCT o."userId")::int                AS customers
      FROM "VendorOrder" vo
      JOIN "Order" o ON o.id = vo."orderId"
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity) AS qty FROM "OrderItem" oi WHERE oi."vendorOrderId" = vo.id
      ) it ON true
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
        AND vo.status IN ${COUNTED_SQL}
        ${vendorFilter(scope.vendorId)}
    `;
    const gross = num(row?.gross);
    const orders = num(row?.orders);
    return {
      gross,
      commission: num(row?.commission),
      earnings: num(row?.earnings),
      shipping: num(row?.shipping),
      items: num(row?.items),
      orders,
      customers: num(row?.customers),
      aov: Math.round(safeDiv(gross, orders)),
    };
  }

  async series(
    scope: Scope,
    from: Date,
    to: Date,
    keys: string[],
    range: ResolvedRange,
  ): Promise<SeriesPoint[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string } & Record<string, unknown>>
    >`
      SELECT
        ${bucketKeySql('o."createdAt"', range.granularity, range.timezone)} AS bucket,
        COALESCE(SUM(vo."subtotalCents"), 0)::bigint   AS gross,
        COALESCE(SUM(vo."commissionCents"), 0)::bigint AS commission,
        COALESCE(SUM(vo."payoutCents"), 0)::bigint     AS earnings,
        COALESCE(SUM(it.qty), 0)::bigint               AS items,
        COUNT(DISTINCT vo."orderId")::int              AS orders
      FROM "VendorOrder" vo
      JOIN "Order" o ON o.id = vo."orderId"
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity) AS qty FROM "OrderItem" oi WHERE oi."vendorOrderId" = vo.id
      ) it ON true
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
        AND vo.status IN ${COUNTED_SQL}
        ${vendorFilter(scope.vendorId)}
      GROUP BY 1
    `;
    return fillSeries<Omit<SeriesPoint, 'bucket'>>(keys, rows, [
      'gross',
      'commission',
      'earnings',
      'orders',
      'items',
    ]);
  }

  /** Current-period series with the previous period aligned point-for-point. */
  async comparedSeries(scope: Scope, range: ResolvedRange) {
    const keys = bucketKeys(
      range.from,
      range.to,
      range.granularity,
      range.timezone,
    );
    const prevKeys = previousBucketKeys(range);
    const [current, previous] = await Promise.all([
      this.series(scope, range.from, range.to, keys, range),
      this.series(scope, range.prevFrom, range.prevTo, prevKeys, range),
    ]);
    return current.map((point, i) => ({
      ...point,
      prevBucket: previous[i]?.bucket ?? null,
      prevGross: previous[i]?.gross ?? 0,
      prevOrders: previous[i]?.orders ?? 0,
      prevEarnings: previous[i]?.earnings ?? 0,
      prevCommission: previous[i]?.commission ?? 0,
    }));
  }

  /** Vendor-order status counts for orders placed in the window (all statuses). */
  async statusBreakdown(scope: Scope, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT vo.status::text AS status,
             COUNT(*)::int AS count,
             COALESCE(SUM(vo."subtotalCents"), 0)::bigint AS gross
      FROM "VendorOrder" vo
      JOIN "Order" o ON o.id = vo."orderId"
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
        ${vendorFilter(scope.vendorId)}
      GROUP BY 1
    `;
    return rows.map((r) => ({
      status: String(r.status),
      count: num(r.count),
      gross: num(r.gross),
    }));
  }

  /** Current fulfilment pipeline regardless of date: what still needs action. */
  async openPipeline(scope: Scope) {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COUNT(*) FILTER (WHERE vo.status IN ('PAID','PROCESSING'))::int AS "toFulfil",
        COUNT(*) FILTER (WHERE vo.status IN ('PAID','PROCESSING') AND so.type = 'PICKUP')::int AS "awaitingPickup",
        COUNT(*) FILTER (WHERE vo.status = 'SHIPPED')::int AS shipped,
        COUNT(*) FILTER (
          WHERE vo.status IN ('PAID','PROCESSING') AND o."createdAt" < NOW() AT TIME ZONE 'UTC' - INTERVAL '2 days'
        )::int AS overdue
      FROM "VendorOrder" vo
      JOIN "Order" o ON o.id = vo."orderId"
      LEFT JOIN "VendorShippingOption" so ON so.id = vo."shippingOptionId"
      WHERE vo.status IN ('PAID','PROCESSING','SHIPPED')
        ${vendorFilter(scope.vendorId)}
    `;
    return {
      toFulfil: num(row?.toFulfil),
      awaitingPickup: num(row?.awaitingPickup),
      shipped: num(row?.shipped),
      overdue: num(row?.overdue),
    };
  }

  /** Per-product sales in the window. Revenue = Σ price × qty = the vendor order subtotal. */
  async byProduct(scope: Scope, from: Date, to: Date, limit?: number) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        p.id, p.name, p."baseUnit", p."vendorId", v."storeName", c.name AS category,
        COALESCE(SUM(oi.quantity), 0)::bigint AS items,
        COALESCE(SUM(oi.quantity * oi."priceCents"), 0)::bigint AS revenue,
        COALESCE(SUM(oi.quantity * pv."unitAmount"), 0)::bigint AS "baseUnits",
        COUNT(DISTINCT vo."orderId")::int AS orders,
        MAX(o."createdAt") AS "lastSoldAt"
      FROM "OrderItem" oi
      JOIN "VendorOrder" vo ON vo.id = oi."vendorOrderId"
      JOIN "Order" o ON o.id = vo."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      JOIN "Vendor" v ON v.id = p."vendorId"
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "ProductVariant" pv ON pv.id = oi."variantId"
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
        AND vo.status IN ${COUNTED_SQL}
        ${vendorFilter(scope.vendorId)}
      GROUP BY p.id, v."storeName", c.name
      ORDER BY revenue DESC, items DESC
      ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
    `;
    return rows.map((r) => ({
      productId: String(r.id),
      name: String(r.name),
      baseUnit: String(r.baseUnit),
      vendorId: String(r.vendorId),
      storeName: String(r.storeName),
      category: String(r.category),
      items: num(r.items),
      revenue: num(r.revenue),
      baseUnits: num(r.baseUnits),
      orders: num(r.orders),
      lastSoldAt: r.lastSoldAt as Date | null,
    }));
  }

  async byCategory(scope: Scope, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT c.id, c.name,
        COALESCE(SUM(oi.quantity), 0)::bigint AS items,
        COALESCE(SUM(oi.quantity * oi."priceCents"), 0)::bigint AS revenue,
        COUNT(DISTINCT vo."orderId")::int AS orders
      FROM "OrderItem" oi
      JOIN "VendorOrder" vo ON vo.id = oi."vendorOrderId"
      JOIN "Order" o ON o.id = vo."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
        AND vo.status IN ${COUNTED_SQL}
        ${vendorFilter(scope.vendorId)}
      GROUP BY c.id
      ORDER BY revenue DESC
    `;
    return rows.map((r) => ({
      categoryId: String(r.id),
      name: String(r.name),
      items: num(r.items),
      revenue: num(r.revenue),
      orders: num(r.orders),
    }));
  }

  /** Sales grouped by the customer's shipping state (normalised to state codes). */
  async byShippingState(scope: Scope, from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT o."shippingState" AS state,
        COALESCE(SUM(vo."subtotalCents"), 0)::bigint AS gross,
        COUNT(DISTINCT vo."orderId")::int AS orders,
        COUNT(DISTINCT o."userId")::int AS customers
      FROM "VendorOrder" vo
      JOIN "Order" o ON o.id = vo."orderId"
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
        AND vo.status IN ${COUNTED_SQL}
        ${vendorFilter(scope.vendorId)}
      GROUP BY 1
    `;
    // Several raw spellings can map to one code, so merge after normalising.
    // Customers can't be summed across spellings exactly; the overlap would
    // require the same buyer to type their state two different ways.
    const merged = new Map<
      string,
      { state: string; gross: number; orders: number; customers: number }
    >();
    for (const r of rows) {
      const state = normaliseState(r.state as string | null);
      const entry = merged.get(state) ?? {
        state,
        gross: 0,
        orders: 0,
        customers: 0,
      };
      entry.gross += num(r.gross);
      entry.orders += num(r.orders);
      entry.customers += num(r.customers);
      merged.set(state, entry);
    }
    return [...merged.values()].sort((a, b) => b.gross - a.gross);
  }
}
