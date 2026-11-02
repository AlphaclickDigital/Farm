import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedRange, zonedMidnight } from '../reporting/date-range';
import { COUNTED_SQL, num, pctChange, safeDiv } from '../reporting/sql';
import { SalesAnalyticsService } from './sales-analytics.service';
import { classifyStock } from './inventory-analytics.service';

export const PRODUCT_FILTERS = [
  'all',
  'best',
  'lowest',
  'most_viewed',
  'low_stock',
  'out_of_stock',
] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number];

@Injectable()
export class ProductAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesAnalyticsService,
  ) {}

  /** Product views per product for local calendar days [startDate, endDate]. */
  async viewsByProduct(range: ResolvedRange, vendorId?: string) {
    const rows = await this.prisma.productViewDaily.groupBy({
      by: ['productId'],
      where: {
        day: { gte: new Date(range.startDate), lte: new Date(range.endDate) },
        ...(vendorId && { vendorId }),
      },
      _sum: { views: true },
    });
    return new Map(rows.map((r) => [r.productId, r._sum.views ?? 0]));
  }

  async totalViews(
    vendorId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
    const result = await this.prisma.productViewDaily.aggregate({
      where: {
        day: { gte: new Date(startDate), lte: new Date(endDate) },
        ...(vendorId && { vendorId }),
      },
      _sum: { views: true },
    });
    return result._sum.views ?? 0;
  }

  /** Date view tracking began (first recorded day), or null if never. */
  async trackingSince(vendorId?: string) {
    const first = await this.prisma.productViewDaily.findFirst({
      where: vendorId ? { vendorId } : {},
      orderBy: { day: 'asc' },
      select: { day: true },
    });
    return first?.day ?? null;
  }

  /**
   * Start of the measurable conversion window inside [from, to): views only
   * exist from the first tracked day, so orders placed before then must not
   * be divided by views (that would overstate conversion). Returns null when
   * tracking hadn't started by the end of the window.
   */
  conversionWindowStart(from: Date, to: Date, since: Date | null) {
    if (!since) return null;
    const [y, m, d] = since.toISOString().slice(0, 10).split('-').map(Number);
    const start = new Date(
      Math.max(from.getTime(), zonedMidnight(y, m, d).getTime()),
    );
    return start < to ? start : null;
  }

  /**
   * Full product performance table for one vendor. A vendor's catalogue is
   * bounded (hundreds of products at most), so rows are merged and filtered
   * here and only the requested page is returned to the client.
   */
  async vendorProductPerformance(
    vendorId: string,
    range: ResolvedRange,
    opts: { filter: ProductFilter; q?: string; page: number; pageSize: number },
  ) {
    const [products, current, previous, views, since] = await Promise.all([
      this.prisma.product.findMany({
        where: { vendorId },
        select: {
          id: true,
          name: true,
          baseUnit: true,
          isActive: true,
          stockAmount: true,
          category: { select: { name: true } },
          images: { select: { url: true }, take: 1 },
          variants: {
            select: { label: true, unitAmount: true, isActive: true },
          },
          _count: { select: { reviews: true } },
        },
      }),
      this.sales.byProduct({ vendorId }, range.from, range.to),
      this.sales.byProduct({ vendorId }, range.prevFrom, range.prevTo),
      this.viewsByProduct(range, vendorId),
      this.trackingSince(vendorId),
    ]);

    const cur = new Map(current.map((s) => [s.productId, s]));
    const prev = new Map(previous.map((s) => [s.productId, s]));
    const totalRevenue = current.reduce((sum, s) => sum + s.revenue, 0);

    // Orders for conversion only count from when view tracking began.
    const windowStart = this.conversionWindowStart(range.from, range.to, since);
    const tracked =
      windowStart && windowStart > range.from
        ? new Map(
            (
              await this.sales.byProduct({ vendorId }, windowStart, range.to)
            ).map((s) => [s.productId, s]),
          )
        : cur;

    let rows = products.map((p) => {
      const c = cur.get(p.id);
      const pv = prev.get(p.id);
      const productViews = views.get(p.id) ?? 0;
      const stock = classifyStock(p);
      return {
        productId: p.id,
        name: p.name,
        image: p.images[0]?.url ?? null,
        category: p.category.name,
        baseUnit: p.baseUnit,
        isActive: p.isActive,
        itemsSold: c?.items ?? 0,
        orders: c?.orders ?? 0,
        revenue: c?.revenue ?? 0,
        revenueShare: safeDiv(c?.revenue ?? 0, totalRevenue) * 100,
        previousRevenue: pv?.revenue ?? 0,
        trend: pctChange(c?.revenue ?? 0, pv?.revenue ?? 0),
        stockAmount: p.stockAmount,
        sellableUnits: stock.sellableUnits,
        smallestVariant: stock.smallestVariant,
        stockState: stock.state,
        views: productViews,
        // Conversion only when we actually have views for the period.
        conversionRate:
          productViews > 0 && windowStart
            ? safeDiv(tracked.get(p.id)?.orders ?? 0, productViews) * 100
            : null,
      };
    });

    if (opts.q) {
      const needle = opts.q.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
    }

    switch (opts.filter) {
      case 'best':
        rows = rows
          .filter((r) => r.revenue > 0)
          .sort((a, b) => b.revenue - a.revenue);
        break;
      case 'lowest':
        rows = rows
          .filter((r) => r.isActive)
          .sort((a, b) => a.revenue - b.revenue || a.itemsSold - b.itemsSold);
        break;
      case 'most_viewed':
        rows = rows.sort((a, b) => b.views - a.views);
        break;
      case 'low_stock':
        rows = rows.filter((r) => r.stockState === 'low');
        break;
      case 'out_of_stock':
        rows = rows.filter((r) => r.stockState === 'out');
        break;
      default:
        rows = rows.sort(
          (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name),
        );
    }

    const total = rows.length;
    const start = (opts.page - 1) * opts.pageSize;
    return {
      viewTrackingSince: since,
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      data: rows.slice(start, start + opts.pageSize),
      allRows: rows,
    };
  }

  /** Marketplace-wide product analytics for admins (SQL-limited lists). */
  async marketplaceProducts(range: ResolvedRange) {
    const [counts, top, categories, lowest, categoryDistribution] =
      await Promise.all([
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE p."isActive")::int AS active,
          COUNT(*) FILTER (WHERE p."isActive" AND v."isApproved" AND NOT v."isSuspended")::int AS listed,
          COUNT(*) FILTER (WHERE p."createdAt" >= ${range.from} AND p."createdAt" < ${range.to})::int AS "newInRange"
        FROM "Product" p JOIN "Vendor" v ON v.id = p."vendorId"
      `,
        this.sales.byProduct({}, range.from, range.to, 10),
        this.sales.byCategory({}, range.from, range.to),
        // Lowest performers: listed products that existed for the whole window.
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT p.id, p.name, v."storeName",
          COALESCE(s.revenue, 0)::bigint AS revenue,
          COALESCE(s.items, 0)::bigint AS items
        FROM "Product" p
        JOIN "Vendor" v ON v.id = p."vendorId"
        LEFT JOIN (
          SELECT oi."productId",
            SUM(oi.quantity * oi."priceCents") AS revenue,
            SUM(oi.quantity) AS items
          FROM "OrderItem" oi
          JOIN "VendorOrder" vo ON vo.id = oi."vendorOrderId"
          JOIN "Order" o ON o.id = vo."orderId"
          WHERE o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to}
            AND vo.status IN ${COUNTED_SQL}
          GROUP BY 1
        ) s ON s."productId" = p.id
        WHERE p."isActive" AND v."isApproved" AND NOT v."isSuspended"
          AND p."createdAt" < ${range.from}
        ORDER BY revenue ASC, items ASC, p."createdAt" ASC
        LIMIT 10
      `,
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT c.id, c.name,
          COUNT(p.id)::int AS products,
          COUNT(p.id) FILTER (WHERE p."isActive")::int AS active
        FROM "Category" c
        LEFT JOIN "Product" p ON p."categoryId" = c.id
        GROUP BY c.id
        ORDER BY products DESC
      `,
      ]);
    const c = counts[0] ?? {};
    return {
      counts: {
        total: num(c.total),
        active: num(c.active),
        listed: num(c.listed),
        newInRange: num(c.newInRange),
      },
      topProducts: top,
      lowestProducts: lowest.map((r) => ({
        productId: String(r.id),
        name: String(r.name),
        storeName: String(r.storeName),
        revenue: num(r.revenue),
        items: num(r.items),
      })),
      categorySales: categories,
      categoryDistribution: categoryDistribution.map((r) => ({
        categoryId: String(r.id),
        name: String(r.name),
        products: num(r.products),
        active: num(r.active),
      })),
    };
  }
}
