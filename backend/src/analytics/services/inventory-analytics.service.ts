import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { daysAgo } from '../reporting/date-range';
import { SalesAnalyticsService } from './sales-analytics.service';

// A product is "low" when fewer than this many packs of its smallest active
// variant can still be sold, or when stock covers fewer than LOW_COVER_DAYS
// at the recent sales rate.
export const LOW_STOCK_SELLABLE_UNITS = 5;
export const LOW_COVER_DAYS = 7;
const VELOCITY_WINDOW_DAYS = 30;
const NO_SALES_GRACE_DAYS = 14;

export type StockState = 'in_stock' | 'low' | 'out' | 'inactive';

export interface InventoryRow {
  productId: string;
  name: string;
  image: string | null;
  category: string;
  baseUnit: string;
  isActive: boolean;
  stockAmount: number;
  /** Smallest active variant, used for "how many can I still sell". */
  smallestVariant: { label: string; unitAmount: number } | null;
  sellableUnits: number;
  state: StockState;
  sold30dBaseUnits: number;
  sold30dItems: number;
  sold7dItems: number;
  /** Base units per day over the last 30 days. */
  dailyVelocity: number;
  daysOfCover: number | null;
  lastSoldAt: Date | null;
  noRecentSales: boolean;
  highDemand: boolean;
  createdAt: Date;
}

/**
 * Stock lives on Product.stockAmount in the product's base unit (gram, ml,
 * piece) and each variant consumes `unitAmount` of it. All comparisons happen
 * per product in its own base unit, so products sold by weight and by piece
 * are never added together.
 */
export function classifyStock(product: {
  isActive: boolean;
  stockAmount: number;
  variants: { label: string; unitAmount: number; isActive: boolean }[];
}) {
  const active = product.variants.filter((v) => v.isActive && v.unitAmount > 0);
  const pool = active.length
    ? active
    : product.variants.filter((v) => v.unitAmount > 0);
  const smallest = pool.reduce<(typeof pool)[number] | null>(
    (min, v) => (!min || v.unitAmount < min.unitAmount ? v : min),
    null,
  );
  const sellableUnits = smallest
    ? Math.floor(product.stockAmount / smallest.unitAmount)
    : 0;
  let state: StockState;
  if (!product.isActive) state = 'inactive';
  else if (sellableUnits <= 0) state = 'out';
  else if (sellableUnits <= LOW_STOCK_SELLABLE_UNITS) state = 'low';
  else state = 'in_stock';
  return {
    smallestVariant: smallest
      ? { label: smallest.label, unitAmount: smallest.unitAmount }
      : null,
    sellableUnits,
    state,
  };
}

@Injectable()
export class InventoryAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesAnalyticsService,
  ) {}

  async vendorInventory(vendorId: string, now = new Date()) {
    const [products, sold30, sold7, sold35to8] = await Promise.all([
      this.prisma.product.findMany({
        where: { vendorId },
        select: {
          id: true,
          name: true,
          baseUnit: true,
          isActive: true,
          stockAmount: true,
          createdAt: true,
          category: { select: { name: true } },
          images: { select: { url: true }, take: 1 },
          variants: {
            select: { label: true, unitAmount: true, isActive: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.sales.byProduct(
        { vendorId },
        daysAgo(VELOCITY_WINDOW_DAYS, now),
        now,
      ),
      this.sales.byProduct({ vendorId }, daysAgo(7, now), now),
      this.sales.byProduct({ vendorId }, daysAgo(35, now), daysAgo(7, now)),
    ]);

    const lastSold = await this.lastSoldDates(vendorId);
    const by30 = new Map(sold30.map((s) => [s.productId, s]));
    const by7 = new Map(sold7.map((s) => [s.productId, s]));
    const byPrior = new Map(sold35to8.map((s) => [s.productId, s]));

    const rows: InventoryRow[] = products.map((p) => {
      const {
        smallestVariant,
        sellableUnits,
        state: baseState,
      } = classifyStock(p);
      const s30 = by30.get(p.id);
      const dailyVelocity = (s30?.baseUnits ?? 0) / VELOCITY_WINDOW_DAYS;
      const daysOfCover =
        dailyVelocity > 0 ? p.stockAmount / dailyVelocity : null;

      let state = baseState;
      if (
        state === 'in_stock' &&
        daysOfCover !== null &&
        daysOfCover < LOW_COVER_DAYS
      )
        state = 'low';

      // "High demand": last 7 days at least double the prior 4-week weekly
      // average, with a floor so one or two orders don't trigger it.
      const last7 = by7.get(p.id)?.items ?? 0;
      const priorWeekly = (byPrior.get(p.id)?.items ?? 0) / 4;
      const highDemand =
        p.isActive && last7 >= 5 && last7 >= 2 * Math.max(priorWeekly, 1);

      const olderThanGrace = p.createdAt < daysAgo(NO_SALES_GRACE_DAYS, now);
      return {
        productId: p.id,
        name: p.name,
        image: p.images[0]?.url ?? null,
        category: p.category.name,
        baseUnit: p.baseUnit,
        isActive: p.isActive,
        stockAmount: p.stockAmount,
        smallestVariant,
        sellableUnits,
        state,
        sold30dBaseUnits: s30?.baseUnits ?? 0,
        sold30dItems: s30?.items ?? 0,
        sold7dItems: last7,
        dailyVelocity,
        daysOfCover,
        lastSoldAt: lastSold.get(p.id) ?? null,
        noRecentSales: p.isActive && olderThanGrace && !s30,
        highDemand,
        createdAt: p.createdAt,
      };
    });

    const active = rows.filter((r) => r.isActive);
    return {
      thresholds: {
        lowSellableUnits: LOW_STOCK_SELLABLE_UNITS,
        lowCoverDays: LOW_COVER_DAYS,
      },
      summary: {
        totalProducts: rows.length,
        activeProducts: active.length,
        inStock: active.filter((r) => r.state === 'in_stock').length,
        lowStock: active.filter((r) => r.state === 'low').length,
        outOfStock: active.filter((r) => r.state === 'out').length,
        inactive: rows.length - active.length,
        noRecentSales: rows.filter((r) => r.noRecentSales).length,
        highDemand: rows.filter((r) => r.highDemand).length,
      },
      rows,
    };
  }

  private async lastSoldDates(vendorId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ productId: string; lastSoldAt: Date }>
    >`
      SELECT oi."productId" AS "productId", MAX(o."createdAt") AS "lastSoldAt"
      FROM "OrderItem" oi
      JOIN "VendorOrder" vo ON vo.id = oi."vendorOrderId"
      JOIN "Order" o ON o.id = vo."orderId"
      WHERE vo."vendorId" = ${vendorId}
        AND vo.status IN ('PAID','PROCESSING','SHIPPED','COMPLETED')
      GROUP BY 1
    `;
    return new Map(rows.map((r) => [r.productId, r.lastSoldAt]));
  }

  /** Marketplace-wide stock health counts for admin dashboards. */
  // Same rules as classifyStock(), expressed in SQL so it scales with catalogue size.
  async marketplaceStockHealth() {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH mins AS (
        SELECT p.id, p."stockAmount",
          COALESCE(
            MIN(pv."unitAmount") FILTER (WHERE pv."isActive" AND pv."unitAmount" > 0),
            MIN(pv."unitAmount") FILTER (WHERE pv."unitAmount" > 0)
          ) AS "minUnit"
        FROM "Product" p
        JOIN "Vendor" v ON v.id = p."vendorId"
        LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id
        WHERE p."isActive" AND v."isApproved" AND NOT v."isSuspended"
        GROUP BY p.id
      )
      SELECT
        COUNT(*)::int AS active,
        COUNT(*) FILTER (WHERE "minUnit" IS NULL OR "stockAmount" < "minUnit")::int AS out,
        COUNT(*) FILTER (
          WHERE "minUnit" IS NOT NULL AND "stockAmount" >= "minUnit"
            AND floor("stockAmount"::numeric / "minUnit") <= ${LOW_STOCK_SELLABLE_UNITS}
        )::int AS low
      FROM mins
    `;
    return {
      active: Number(row?.active ?? 0),
      low: Number(row?.low ?? 0),
      out: Number(row?.out ?? 0),
    };
  }
}
