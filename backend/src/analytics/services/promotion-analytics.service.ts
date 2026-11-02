import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedRange, bucketKeys } from '../reporting/date-range';
import {
  COUNTED_SQL,
  bucketKeySql,
  fillSeries,
  metric,
  num,
} from '../reporting/sql';

export const PROMOTION_STATES = [
  'all',
  'active',
  'scheduled',
  'expired',
  'cancelled',
] as const;
export type PromotionState = (typeof PROMOTION_STATES)[number];

// Promotion.status is only flipped to EXPIRED by the hourly sweeper, so
// "live" is always decided by the dates as well.
function stateWhere(
  state: PromotionState,
  now: Date,
): Prisma.PromotionWhereInput {
  switch (state) {
    case 'active':
      return {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      };
    case 'scheduled':
      return { status: 'ACTIVE', startDate: { gt: now } };
    case 'expired':
      return {
        OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endDate: { lt: now } }],
      };
    case 'cancelled':
      return { status: 'CANCELLED' };
    default:
      return {};
  }
}

export function promotionState(
  p: { status: string; startDate: Date; endDate: Date },
  now = new Date(),
) {
  if (p.status === 'CANCELLED') return 'cancelled';
  if (p.status === 'EXPIRED' || p.endDate < now) return 'expired';
  if (p.startDate > now) return 'scheduled';
  return 'active';
}

@Injectable()
export class PromotionAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async overview(range: ResolvedRange, vendorId?: string) {
    const now = new Date();
    const scope = vendorId ? { vendorId } : {};
    const keys = bucketKeys(
      range.from,
      range.to,
      range.granularity,
      range.timezone,
    );
    const soon = new Date(now.getTime() + 3 * 86_400_000);

    const [
      active,
      expired,
      cancelled,
      revenue,
      prevRevenue,
      byType,
      series,
      mostPromoted,
      byVendor,
      expiring,
    ] = await Promise.all([
      this.prisma.promotion.count({
        where: { ...scope, ...stateWhere('active', now) },
      }),
      this.prisma.promotion.count({
        where: { ...scope, ...stateWhere('expired', now) },
      }),
      this.prisma.promotion.count({
        where: { ...scope, ...stateWhere('cancelled', now) },
      }),
      this.prisma.promotion.aggregate({
        where: { ...scope, createdAt: { gte: range.from, lt: range.to } },
        _sum: { priceCents: true },
        _count: true,
      }),
      this.prisma.promotion.aggregate({
        where: {
          ...scope,
          createdAt: { gte: range.prevFrom, lt: range.prevTo },
        },
        _sum: { priceCents: true },
        _count: true,
      }),
      this.prisma.promotion.groupBy({
        by: ['type'],
        where: { ...scope, createdAt: { gte: range.from, lt: range.to } },
        _sum: { priceCents: true },
        _count: true,
      }),
      this.prisma.$queryRaw<
        Array<{ bucket: string } & Record<string, unknown>>
      >`
          SELECT ${bucketKeySql('pr."createdAt"', range.granularity, range.timezone)} AS bucket,
            COALESCE(SUM(pr."priceCents"), 0)::bigint AS revenue,
            COUNT(*)::int AS purchases
          FROM "Promotion" pr
          WHERE pr."createdAt" >= ${range.from} AND pr."createdAt" < ${range.to}
            ${vendorId ? Prisma.sql`AND pr."vendorId" = ${vendorId}` : Prisma.empty}
          GROUP BY 1
        `,
      this.prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT p.id, p.name, v."storeName", COUNT(*)::int AS promotions,
            COALESCE(SUM(pr."priceCents"), 0)::bigint AS spend
          FROM "Promotion" pr
          JOIN "Product" p ON p.id = pr."productId"
          JOIN "Vendor" v ON v.id = pr."vendorId"
          WHERE pr."createdAt" >= ${range.from} AND pr."createdAt" < ${range.to}
            ${vendorId ? Prisma.sql`AND pr."vendorId" = ${vendorId}` : Prisma.empty}
          GROUP BY p.id, v."storeName"
          ORDER BY promotions DESC, spend DESC
          LIMIT 8
        `,
      vendorId
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Record<string, unknown>[]>`
              SELECT v.id, v."storeName", COUNT(*)::int AS promotions,
                COALESCE(SUM(pr."priceCents"), 0)::bigint AS spend
              FROM "Promotion" pr JOIN "Vendor" v ON v.id = pr."vendorId"
              WHERE pr."createdAt" >= ${range.from} AND pr."createdAt" < ${range.to}
              GROUP BY v.id
              ORDER BY spend DESC
              LIMIT 10
            `,
      this.prisma.promotion.findMany({
        where: {
          ...scope,
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now, lte: soon },
        },
        include: {
          vendor: { select: { id: true, storeName: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: { endDate: 'asc' },
        take: 10,
      }),
    ]);

    return {
      counts: { active, expired, cancelled },
      revenue: {
        ...metric(
          revenue._sum.priceCents ?? 0,
          prevRevenue._sum.priceCents ?? 0,
        ),
        count: revenue._count,
      },
      purchases: metric(revenue._count, prevRevenue._count),
      byType: ['FEATURED_PRODUCT', 'FEATURED_VENDOR'].map((type) => {
        const row = byType.find((b) => b.type === type);
        return {
          type,
          count: row?._count ?? 0,
          revenue: row?._sum.priceCents ?? 0,
        };
      }),
      series: fillSeries<{ revenue: number; purchases: number }>(keys, series, [
        'revenue',
        'purchases',
      ]),
      mostPromoted: mostPromoted.map((r) => ({
        productId: String(r.id),
        name: String(r.name),
        storeName: String(r.storeName),
        promotions: num(r.promotions),
        spend: num(r.spend),
      })),
      spendByVendor: byVendor.map((r) => ({
        vendorId: String(r.id),
        storeName: String(r.storeName),
        promotions: num(r.promotions),
        spend: num(r.spend),
      })),
      expiringSoon: expiring,
    };
  }

  /**
   * Paginated promotion list. For featured products it also reports the
   * product's sales during the promotion window and in the equal-length
   * window before it. That is a before/after comparison, not attribution —
   * the marketplace does not track which sales came from the featured slot.
   */
  async list(opts: {
    vendorId?: string;
    state: PromotionState;
    type?: 'FEATURED_PRODUCT' | 'FEATURED_VENDOR';
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const now = new Date();
    const where: Prisma.PromotionWhereInput = {
      ...(opts.vendorId && { vendorId: opts.vendorId }),
      ...stateWhere(opts.state, now),
      ...(opts.type && { type: opts.type }),
      ...(opts.q && {
        OR: [
          { vendor: { storeName: { contains: opts.q, mode: 'insensitive' } } },
          { product: { name: { contains: opts.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [total, promotions] = await Promise.all([
      this.prisma.promotion.count({ where }),
      this.prisma.promotion.findMany({
        where,
        include: {
          vendor: { select: { id: true, storeName: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
    ]);

    const productPromos = promotions.filter((p) => p.productId);
    const windows = new Map<string, { during: number; before: number }>();
    if (productPromos.length) {
      const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT pr.id,
          COALESCE(SUM(oi.quantity * oi."priceCents") FILTER (
            WHERE o."createdAt" >= pr."startDate" AND o."createdAt" < LEAST(pr."endDate", NOW() AT TIME ZONE 'UTC')
          ), 0)::bigint AS during,
          COALESCE(SUM(oi.quantity * oi."priceCents") FILTER (
            WHERE o."createdAt" >= pr."startDate" - (LEAST(pr."endDate", NOW() AT TIME ZONE 'UTC') - pr."startDate")
              AND o."createdAt" < pr."startDate"
          ), 0)::bigint AS before
        FROM "Promotion" pr
        LEFT JOIN "OrderItem" oi ON oi."productId" = pr."productId"
        LEFT JOIN "VendorOrder" vo ON vo.id = oi."vendorOrderId" AND vo.status IN ${COUNTED_SQL}
        LEFT JOIN "Order" o ON o.id = vo."orderId"
        WHERE pr.id IN (${Prisma.join(productPromos.map((p) => p.id))})
        GROUP BY pr.id
      `;
      for (const r of rows)
        windows.set(String(r.id), {
          during: num(r.during),
          before: num(r.before),
        });
    }

    return {
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      data: promotions.map((p) => ({
        ...p,
        state: promotionState(p, now),
        salesDuring: windows.get(p.id)?.during ?? null,
        salesBefore: windows.get(p.id)?.before ?? null,
      })),
    };
  }
}
