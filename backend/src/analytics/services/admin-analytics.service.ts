import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResolvedRange,
  bucketKeys,
  daysAgo,
  localDateTimeString,
} from '../reporting/date-range';
import {
  COUNTED_SQL,
  bucketKeySql,
  fillSeries,
  metric,
  num,
  pctChange,
  safeDiv,
} from '../reporting/sql';
import { centsToDollars, toCsv } from '../reporting/csv';
import {
  STATE_CODES,
  SalesAnalyticsService,
  normaliseState,
} from './sales-analytics.service';
import { FinanceAnalyticsService } from './finance-analytics.service';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { CustomerAnalyticsService } from './customer-analytics.service';
import { PromotionAnalyticsService } from './promotion-analytics.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { Insight, InsightSeverity } from './vendor-analytics.service';

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
};
const EXPORT_ROW_LIMIT = 10_000;

export const LEADERBOARD_SORTS = [
  'gmv',
  'orders',
  'commission',
  'aov',
  'rating',
  'createdAt',
  'storeName',
  'trend',
] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

export const ADMIN_EXPORTS = [
  'revenue',
  'vendors',
  'orders',
  'products',
  'promotions',
  'customers',
] as const;
export type AdminExport = (typeof ADMIN_EXPORTS)[number];

export interface LeaderboardQuery {
  state?: string;
  status?: 'approved' | 'pending' | 'suspended';
  stripe?: 'ready' | 'incomplete' | 'none';
  performance?: 'selling' | 'no_sales' | 'declining';
  registeredFrom?: string;
  registeredTo?: string;
  q?: string;
  sort: LeaderboardSort;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(cents / 100);

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesAnalyticsService,
    private finance: FinanceAnalyticsService,
    private inventory: InventoryAnalyticsService,
    private customers: CustomerAnalyticsService,
    private promotions: PromotionAnalyticsService,
    private products: ProductAnalyticsService,
  ) {}

  private async activeSellingVendors(from: Date, to: Date) {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COUNT(DISTINCT vo."vendorId")::int AS count
      FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND vo.status IN ${COUNTED_SQL}
    `;
    return num(row?.count);
  }

  async kpis(range: ResolvedRange) {
    const now = new Date();
    const [
      cur,
      prev,
      promo,
      prevPromo,
      series,
      promoSeries,
      vendorsNow,
      vendorsBefore,
      activeNow,
      activePrev,
      customersNow,
      customersBefore,
      productsNow,
      productsBefore,
      promosNow,
      promosAtStart,
    ] = await Promise.all([
      this.sales.totals({}, range.from, range.to),
      this.sales.totals({}, range.prevFrom, range.prevTo),
      this.finance.promotionRevenue(range.from, range.to),
      this.finance.promotionRevenue(range.prevFrom, range.prevTo),
      this.sales.comparedSeries({}, range),
      this.finance.promotionSeries(
        range,
        range.from,
        range.to,
        bucketKeys(range.from, range.to, range.granularity, range.timezone),
      ),
      this.prisma.vendor.count(),
      this.prisma.vendor.count({ where: { createdAt: { lt: range.from } } }),
      this.activeSellingVendors(range.from, range.to),
      this.activeSellingVendors(range.prevFrom, range.prevTo),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.customers.registrationsBefore(range.from),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({
        where: { isActive: true, createdAt: { lt: range.from } },
      }),
      this.prisma.promotion.count({
        where: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      this.prisma.promotion.count({
        where: {
          status: { not: 'CANCELLED' },
          startDate: { lte: range.from },
          endDate: { gte: range.from },
        },
      }),
    ]);

    return {
      range: this.finance.rangeMeta(range),
      kpis: {
        gmv: {
          ...metric(cur.gross, prev.gross),
          spark: series.map((p) => p.gross),
        },
        platformRevenue: {
          ...metric(
            cur.commission + promo.amount,
            prev.commission + prevPromo.amount,
          ),
          spark: series.map(
            (p, i) => p.commission + (promoSeries[i]?.promotions ?? 0),
          ),
          commission: cur.commission,
          promotions: promo.amount,
        },
        orders: {
          ...metric(cur.orders, prev.orders),
          spark: series.map((p) => p.orders),
        },
        // Point-in-time totals compare "now" with "at the start of the range".
        vendors: {
          ...metric(vendorsNow, vendorsBefore),
          added: vendorsNow - vendorsBefore,
        },
        activeVendors: metric(activeNow, activePrev),
        customers: {
          ...metric(customersNow, customersBefore),
          added: customersNow - customersBefore,
        },
        products: {
          ...metric(productsNow, productsBefore),
          added: productsNow - productsBefore,
        },
        activePromotions: metric(promosNow, promosAtStart),
      },
      series: series.map((p, i) => ({
        bucket: p.bucket,
        gmv: p.gross,
        platformRevenue: p.commission + (promoSeries[i]?.promotions ?? 0),
        orders: p.orders,
        prevGmv: p.prevGross,
      })),
    };
  }

  // ───── Vendors ─────

  async vendorOverview(range: ResolvedRange) {
    const keys = bucketKeys(
      range.from,
      range.to,
      range.granularity,
      range.timezone,
    );
    const [counts, stripe, selling, everSold, newSeries, byState] =
      await Promise.all([
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "isApproved" AND NOT "isSuspended")::int AS approved,
          COUNT(*) FILTER (WHERE NOT "isApproved" AND NOT "isSuspended")::int AS pending,
          COUNT(*) FILTER (WHERE "isSuspended")::int AS suspended,
          COUNT(*) FILTER (WHERE "createdAt" >= ${range.from} AND "createdAt" < ${range.to})::int AS "newInRange",
          COUNT(*) FILTER (WHERE "createdAt" >= ${range.prevFrom} AND "createdAt" < ${range.prevTo})::int AS "newInPrev"
        FROM "Vendor"
      `,
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          COUNT(*) FILTER (WHERE sa."chargesEnabled" AND sa."payoutsEnabled")::int AS ready,
          COUNT(*) FILTER (WHERE sa.id IS NOT NULL AND NOT (sa."chargesEnabled" AND sa."payoutsEnabled"))::int AS incomplete,
          COUNT(*) FILTER (WHERE sa.id IS NULL)::int AS none
        FROM "Vendor" v LEFT JOIN "StripeAccount" sa ON sa."vendorId" = v.id
        WHERE v."isApproved" AND NOT v."isSuspended"
      `,
        this.activeSellingVendors(range.from, range.to),
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(*)::int AS count FROM "Vendor" v
        WHERE v."isApproved" AND NOT v."isSuspended" AND NOT EXISTS (
          SELECT 1 FROM "VendorOrder" vo WHERE vo."vendorId" = v.id AND vo.status IN ${COUNTED_SQL}
        )
      `,
        this.prisma.$queryRaw<
          Array<{ bucket: string } & Record<string, unknown>>
        >`
        SELECT ${bucketKeySql('v."createdAt"', range.granularity, range.timezone)} AS bucket,
          COUNT(*)::int AS registrations
        FROM "Vendor" v
        WHERE v."createdAt" >= ${range.from} AND v."createdAt" < ${range.to}
        GROUP BY 1
      `,
        this.prisma.vendor.groupBy({
          by: ['state'],
          where: { isApproved: true, isSuspended: false },
          _count: true,
        }),
      ]);
    const c = counts[0] ?? {};
    const s = stripe[0] ?? {};
    const approved = num(c.approved);
    return {
      range: this.finance.rangeMeta(range),
      counts: {
        total: num(c.total),
        approved,
        pending: num(c.pending),
        suspended: num(c.suspended),
        activeSelling: selling,
        noSalesInRange: Math.max(0, approved - selling),
        neverSold: num(everSold[0]?.count),
        newVendors: metric(num(c.newInRange), num(c.newInPrev)),
      },
      stripe: {
        ready: num(s.ready),
        incomplete: num(s.incomplete),
        none: num(s.none),
      },
      newSeries: fillSeries<{ registrations: number }>(keys, newSeries, [
        'registrations',
      ]),
      byState: this.mergeStates(
        byState.map((r) => ({ state: r.state, count: r._count })),
      ),
    };
  }

  private mergeStates(rows: { state: string | null; count: number }[]) {
    const merged = new Map<string, number>();
    for (const r of rows) {
      const state = normaliseState(r.state);
      merged.set(state, (merged.get(state) ?? 0) + r.count);
    }
    return [...merged.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
  }

  async leaderboard(range: ResolvedRange, query: LeaderboardQuery) {
    const where: Prisma.Sql[] = [];
    if (query.state)
      where.push(
        Prisma.sql`UPPER(TRIM(v.state)) = ${query.state.toUpperCase()}`,
      );
    if (query.status === 'approved')
      where.push(Prisma.sql`v."isApproved" AND NOT v."isSuspended"`);
    if (query.status === 'pending')
      where.push(Prisma.sql`NOT v."isApproved" AND NOT v."isSuspended"`);
    if (query.status === 'suspended') where.push(Prisma.sql`v."isSuspended"`);
    if (query.stripe === 'ready')
      where.push(Prisma.sql`sa."chargesEnabled" AND sa."payoutsEnabled"`);
    if (query.stripe === 'incomplete')
      where.push(
        Prisma.sql`sa.id IS NOT NULL AND NOT (sa."chargesEnabled" AND sa."payoutsEnabled")`,
      );
    if (query.stripe === 'none') where.push(Prisma.sql`sa.id IS NULL`);
    if (query.performance === 'selling')
      where.push(Prisma.sql`COALESCE(s.gmv, 0) > 0`);
    if (query.performance === 'no_sales')
      where.push(Prisma.sql`COALESCE(s.gmv, 0) = 0`);
    if (query.performance === 'declining')
      where.push(
        Prisma.sql`COALESCE(ps.gmv, 0) > 0 AND COALESCE(s.gmv, 0) < COALESCE(ps.gmv, 0) * 0.75`,
      );
    if (query.registeredFrom)
      where.push(
        Prisma.sql`v."createdAt" >= ${new Date(query.registeredFrom)}`,
      );
    if (query.registeredTo)
      where.push(
        Prisma.sql`v."createdAt" < ${new Date(new Date(query.registeredTo).getTime() + 86_400_000)}`,
      );
    if (query.q)
      where.push(Prisma.sql`v."storeName" ILIKE ${'%' + query.q + '%'}`);

    const sortColumn: Record<LeaderboardSort, string> = {
      gmv: 'gmv',
      orders: 'orders',
      commission: 'commission',
      aov: 'aov',
      rating: 'rating',
      createdAt: '"createdAt"',
      storeName: '"storeName"',
      trend: 'trend',
    };
    const order = Prisma.raw(
      `${sortColumn[query.sort]} ${query.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, "storeName" ASC`,
    );
    const whereSql = where.length
      ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}`
      : Prisma.empty;

    const salesFor = (from: Date, to: Date) => Prisma.sql`
      SELECT vo."vendorId", COUNT(DISTINCT vo."orderId") AS orders,
        SUM(vo."subtotalCents") AS gmv, SUM(vo."commissionCents") AS commission
      FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
      WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to} AND vo.status IN ${COUNTED_SQL}
      GROUP BY 1`;

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM (
        SELECT v.id, v."storeName", v.location, v.state, v."isApproved", v."isSuspended", v."createdAt",
          sa.id IS NOT NULL AS "stripeConnected",
          COALESCE(sa."chargesEnabled" AND sa."payoutsEnabled", false) AS "stripeReady",
          COALESCE(s.orders, 0)::int AS orders,
          COALESCE(s.gmv, 0)::bigint AS gmv,
          COALESCE(s.commission, 0)::bigint AS commission,
          COALESCE(ps.gmv, 0)::bigint AS "prevGmv",
          CASE WHEN COALESCE(s.orders, 0) > 0 THEN (s.gmv / s.orders)::bigint ELSE 0 END AS aov,
          CASE WHEN COALESCE(ps.gmv, 0) > 0 THEN ((COALESCE(s.gmv, 0) - ps.gmv) * 100.0 / ps.gmv)::float8 END AS trend,
          r.rating, COALESCE(r.reviews, 0)::int AS reviews,
          (SELECT COUNT(*) FROM "Product" p WHERE p."vendorId" = v.id AND p."isActive")::int AS products,
          COUNT(*) OVER()::int AS "totalCount"
        FROM "Vendor" v
        LEFT JOIN "StripeAccount" sa ON sa."vendorId" = v.id
        LEFT JOIN (${salesFor(range.from, range.to)}) s ON s."vendorId" = v.id
        LEFT JOIN (${salesFor(range.prevFrom, range.prevTo)}) ps ON ps."vendorId" = v.id
        LEFT JOIN (
          SELECT "vendorId", AVG(rating)::float8 AS rating, COUNT(*) AS reviews FROM "Review" GROUP BY 1
        ) r ON r."vendorId" = v.id
        ${whereSql}
      ) t
      ORDER BY ${order}
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `;
    return {
      range: this.finance.rangeMeta(range),
      total: num(rows[0]?.totalCount),
      page: query.page,
      pageSize: query.pageSize,
      data: rows.map((r) => ({
        id: String(r.id),
        storeName: String(r.storeName),
        location: (r.location as string | null) ?? null,
        state: r.state ? normaliseState(r.state as string) : null,
        status: r.isSuspended
          ? 'suspended'
          : r.isApproved
            ? 'approved'
            : 'pending',
        createdAt: r.createdAt as Date,
        stripe: r.stripeReady
          ? 'ready'
          : r.stripeConnected
            ? 'incomplete'
            : 'none',
        orders: num(r.orders),
        gmv: num(r.gmv),
        commission: num(r.commission),
        aov: num(r.aov),
        prevGmv: num(r.prevGmv),
        trend: r.trend === null || r.trend === undefined ? null : num(r.trend),
        rating:
          r.rating === null || r.rating === undefined ? null : num(r.rating),
        reviews: num(r.reviews),
        products: num(r.products),
      })),
    };
  }

  // ───── Orders ─────

  async orderOverview(range: ResolvedRange) {
    const [
      statusRows,
      pendingCheckouts,
      series,
      byState,
      multiVendor,
      cur,
      prev,
      voStatus,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: range.from, lt: range.to } },
        _count: true,
        _sum: { totalAmountCents: true },
      }),
      this.prisma.pendingOrder.count({
        where: {
          createdAt: { gte: range.from, lt: range.to },
          // Checkouts younger than an hour may still be mid-payment.
          AND: [{ createdAt: { lt: new Date(Date.now() - 3_600_000) } }],
        },
      }),
      this.sales.comparedSeries({}, range),
      this.sales.byShippingState({}, range.from, range.to),
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT LEAST(n, 3)::int AS vendors, COUNT(*)::int AS orders, COALESCE(SUM(gmv), 0)::bigint AS gmv
        FROM (
          SELECT o.id, COUNT(vo.id) AS n, SUM(vo."subtotalCents") AS gmv
          FROM "Order" o JOIN "VendorOrder" vo ON vo."orderId" = o.id
          WHERE o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to} AND vo.status IN ${COUNTED_SQL}
          GROUP BY o.id
        ) x
        GROUP BY 1 ORDER BY 1
      `,
      this.sales.totals({}, range.from, range.to),
      this.sales.totals({}, range.prevFrom, range.prevTo),
      this.sales.statusBreakdown({}, range.from, range.to),
    ]);

    const totalVendorOrders = voStatus.reduce((s, r) => s + r.count, 0);
    const voCount = (status: string) =>
      voStatus.find((r) => r.status === status)?.count ?? 0;
    return {
      range: this.finance.rangeMeta(range),
      statuses: statusRows.map((r) => ({
        status: r.status,
        count: r._count,
        amount: r._sum.totalAmountCents ?? 0,
      })),
      totalPlaced: statusRows.reduce((s, r) => s + r._count, 0),
      abandonedCheckouts: pendingCheckouts,
      orders: metric(cur.orders, prev.orders),
      aov: metric(cur.aov, prev.aov),
      cancellationRate: safeDiv(voCount('CANCELLED'), totalVendorOrders) * 100,
      refundRate: safeDiv(voCount('REFUNDED'), totalVendorOrders) * 100,
      series: series.map((p) => ({
        bucket: p.bucket,
        orders: p.orders,
        prevOrders: p.prevOrders,
        gmv: p.gross,
      })),
      byState,
      multiVendor: multiVendor.map((r) => ({
        vendors: num(r.vendors),
        label:
          num(r.vendors) >= 3
            ? '3+ farms'
            : num(r.vendors) === 2
              ? '2 farms'
              : '1 farm',
        orders: num(r.orders),
        gmv: num(r.gmv),
      })),
    };
  }

  async listOrders(opts: {
    page: number;
    pageSize: number;
    status?: string;
    q?: string;
    vendorId?: string;
    state?: string;
    from?: Date;
    to?: Date;
    sort?: string;
    dir?: 'asc' | 'desc';
  }) {
    const and: Prisma.OrderWhereInput[] = [];
    if (opts.from && opts.to)
      and.push({ createdAt: { gte: opts.from, lt: opts.to } });
    if (opts.vendorId)
      and.push({ vendorOrders: { some: { vendorId: opts.vendorId } } });
    if (opts.state)
      and.push({ shippingState: { equals: opts.state, mode: 'insensitive' } });
    if (opts.q) {
      const q = opts.q.trim();
      const idPrefix = q.replace(/^#/, '').toLowerCase();
      and.push({
        OR: [
          { id: { startsWith: idPrefix } },
          { stripePaymentId: { startsWith: q } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          {
            vendorOrders: {
              some: {
                vendor: { storeName: { contains: q, mode: 'insensitive' } },
              },
            },
          },
        ],
      });
    }
    const countWhere: Prisma.OrderWhereInput = { AND: and };
    const statusFilter: Prisma.OrderWhereInput[] = [];
    if (opts.status && opts.status !== 'all') {
      if (!(opts.status in OrderStatus))
        throw new BadRequestException(`Unknown status "${opts.status}"`);
      statusFilter.push({ status: opts.status as OrderStatus });
    }
    const where: Prisma.OrderWhereInput = { AND: [...and, ...statusFilter] };
    const dir = opts.dir === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.OrderOrderByWithRelationInput =
      opts.sort === 'amount' ? { totalAmountCents: dir } : { createdAt: dir };

    const [total, rows, counts] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy,
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          createdAt: true,
          status: true,
          totalAmountCents: true,
          shippingCents: true,
          shippingState: true,
          shippingCity: true,
          stripePaymentId: true,
          user: { select: { id: true, name: true, email: true } },
          vendorOrders: {
            select: {
              id: true,
              status: true,
              subtotalCents: true,
              commissionCents: true,
              payoutCents: true,
              shippingCents: true,
              refundedAt: true,
              payoutId: true,
              vendor: { select: { id: true, storeName: true } },
            },
          },
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: countWhere,
        _count: true,
      }),
    ]);
    return {
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      data: rows.map((o) => ({
        ...o,
        commissionCents: o.vendorOrders.reduce(
          (s, vo) => s + vo.commissionCents,
          0,
        ),
        merchandiseCents: o.vendorOrders.reduce(
          (s, vo) => s + vo.subtotalCents,
          0,
        ),
      })),
    };
  }

  async orderDetail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        createdAt: true,
        status: true,
        totalAmountCents: true,
        shippingCents: true,
        stripePaymentId: true,
        shippingName: true,
        shippingAddress: true,
        shippingCity: true,
        shippingState: true,
        shippingZip: true,
        shippingPhone: true,
        user: {
          select: { id: true, name: true, email: true, createdAt: true },
        },
        vendorOrders: {
          select: {
            id: true,
            status: true,
            subtotalCents: true,
            commissionCents: true,
            payoutCents: true,
            shippingCents: true,
            shippingMethod: true,
            trackingNumber: true,
            trackingUrl: true,
            stripeRefundId: true,
            refundedAt: true,
            payout: {
              select: {
                id: true,
                status: true,
                completedAt: true,
                stripeTransferId: true,
              },
            },
            vendor: { select: { id: true, storeName: true, state: true } },
            items: {
              select: {
                id: true,
                quantity: true,
                priceCents: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    images: { select: { url: true }, take: 1 },
                  },
                },
                variant: { select: { label: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const previousOrders = await this.prisma.order.count({
      where: { userId: order.user.id, createdAt: { lt: order.createdAt } },
    });
    return { ...order, customerPreviousOrders: previousOrders };
  }

  // ───── Geography ─────

  async geography(range: ResolvedRange) {
    const [customerStates, vendorStates, vendorSales, buyersByState] =
      await Promise.all([
        this.sales.byShippingState({}, range.from, range.to),
        this.prisma.vendor.groupBy({
          by: ['state'],
          where: { isApproved: true, isSuspended: false },
          _count: true,
        }),
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT v.state, COALESCE(SUM(vo."subtotalCents"), 0)::bigint AS gmv, COUNT(DISTINCT vo."orderId")::int AS orders
        FROM "VendorOrder" vo
        JOIN "Order" o ON o.id = vo."orderId"
        JOIN "Vendor" v ON v.id = vo."vendorId"
        WHERE o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to} AND vo.status IN ${COUNTED_SQL}
        GROUP BY 1
      `,
        // Customers have no stored address, so a buyer is placed by the
        // shipping state of their most recent order.
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT state, COUNT(*)::int AS buyers FROM (
          SELECT DISTINCT ON (o."userId") o."userId", o."shippingState" AS state
          FROM "Order" o
          ORDER BY o."userId", o."createdAt" DESC
        ) latest
        GROUP BY 1
      `,
      ]);

    const table = new Map<
      string,
      {
        state: string;
        orders: number;
        gmv: number;
        vendors: number;
        vendorGmv: number;
        vendorOrders: number;
        buyers: number;
      }
    >();
    const row = (state: string) => {
      let r = table.get(state);
      if (!r) {
        r = {
          state,
          orders: 0,
          gmv: 0,
          vendors: 0,
          vendorGmv: 0,
          vendorOrders: 0,
          buyers: 0,
        };
        table.set(state, r);
      }
      return r;
    };
    for (const s of STATE_CODES) row(s);
    for (const c of customerStates) {
      const r = row(c.state);
      r.orders += c.orders;
      r.gmv += c.gross;
    }
    for (const v of vendorStates)
      row(normaliseState(v.state)).vendors += v._count;
    for (const v of vendorSales) {
      const r = row(normaliseState(v.state as string | null));
      r.vendorGmv += num(v.gmv);
      r.vendorOrders += num(v.orders);
    }
    for (const b of buyersByState)
      row(normaliseState(b.state as string | null)).buyers += num(b.buyers);

    const rows = [...table.values()]
      .filter(
        (r) => r.state !== 'Unknown' || r.orders + r.vendors + r.buyers > 0,
      )
      .sort((a, b) => b.gmv - a.gmv || b.vendors - a.vendors);
    const totalGmv = rows.reduce((s, r) => s + r.gmv, 0);
    return {
      range: this.finance.rangeMeta(range),
      states: rows.map((r) => ({
        ...r,
        gmvShare: safeDiv(r.gmv, totalGmv) * 100,
      })),
      topRegion: rows.find((r) => r.gmv > 0)?.state ?? null,
    };
  }

  // ───── Alerts ─────

  async alerts(): Promise<Insight[]> {
    const now = new Date();
    const last30 = daysAgo(30, now);
    const prev30 = daysAgo(60, now);
    const [
      pending,
      stripe,
      stock,
      voLast30,
      refundsLast30,
      failsLast7,
      failsPrev7,
      openDisputes,
      payoutsStuck,
      expiring,
      gmvNow,
      gmvPrev,
      declining,
    ] = await Promise.all([
      this.prisma.vendor.count({
        where: { isApproved: false, isSuspended: false },
      }),
      this.prisma.vendor.count({
        where: {
          isApproved: true,
          isSuspended: false,
          OR: [
            { stripeAccount: null },
            {
              stripeAccount: {
                OR: [{ chargesEnabled: false }, { payoutsEnabled: false }],
              },
            },
          ],
        },
      }),
      this.inventory.marketplaceStockHealth(),
      this.sales.statusBreakdown({}, last30, now),
      this.finance.refunds(undefined, last30, now),
      this.prisma.paymentIncident.count({
        where: { type: 'PAYMENT_FAILED', createdAt: { gte: daysAgo(7, now) } },
      }),
      this.prisma.paymentIncident.count({
        where: {
          type: 'PAYMENT_FAILED',
          createdAt: { gte: daysAgo(14, now), lt: daysAgo(7, now) },
        },
      }),
      this.prisma.paymentIncident.count({
        where: {
          type: 'DISPUTE',
          status: {
            notIn: ['won', 'lost', 'warning_closed', 'charge_refunded'],
          },
        },
      }),
      this.prisma.payout.aggregate({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          createdAt: { lt: new Date(now.getTime() - 3_600_000) },
        },
        _count: true,
        _sum: { amountCents: true },
      }),
      this.prisma.promotion.count({
        where: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now, lte: new Date(now.getTime() + 2 * 86_400_000) },
        },
      }),
      this.sales.totals({}, last30, now),
      this.sales.totals({}, prev30, last30),
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT v.id, v."storeName", cur.gmv AS cur, prev.gmv AS prev FROM "Vendor" v
        JOIN (
          SELECT vo."vendorId", SUM(vo."subtotalCents") AS gmv FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
          WHERE o."createdAt" >= ${prev30} AND o."createdAt" < ${last30} AND vo.status IN ${COUNTED_SQL} GROUP BY 1
        ) prev ON prev."vendorId" = v.id
        LEFT JOIN (
          SELECT vo."vendorId", SUM(vo."subtotalCents") AS gmv FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
          WHERE o."createdAt" >= ${last30} AND vo.status IN ${COUNTED_SQL} GROUP BY 1
        ) cur ON cur."vendorId" = v.id
        WHERE v."isApproved" AND NOT v."isSuspended"
          AND prev.gmv >= 10000 AND COALESCE(cur.gmv, 0) < prev.gmv * 0.5
        ORDER BY prev.gmv DESC
        LIMIT 3
      `,
    ]);

    const out: Insight[] = [];
    if (openDisputes > 0) {
      out.push({
        id: 'disputes',
        severity: 'critical',
        title: `${openDisputes} open payment dispute${openDisputes === 1 ? '' : 's'}`,
        description:
          'Respond in the Stripe Dashboard before the evidence deadline or the funds are lost.',
        action: {
          label: 'View finance',
          href: '/admin/analytics/revenue#finance',
        },
      });
    }
    if (payoutsStuck._count > 0) {
      out.push({
        id: 'payouts-stuck',
        severity: 'critical',
        title: `${payoutsStuck._count} vendor payout${payoutsStuck._count === 1 ? '' : 's'} pending or failed`,
        description: `${money(payoutsStuck._sum.amountCents ?? 0)} has been claimed by vendors but not transferred.`,
        action: { label: 'Review payouts', href: '/admin/payouts' },
      });
    }
    if (pending > 0) {
      out.push({
        id: 'pending-vendors',
        severity: 'warning',
        title: `${pending} vendor application${pending === 1 ? '' : 's'} awaiting review`,
        description: 'New farms cannot sell until they are approved.',
        action: { label: 'Review applications', href: '/admin/vendors' },
      });
    }

    const totalVo = voLast30.reduce((s, r) => s + r.count, 0);
    const cancelled =
      voLast30.find((r) => r.status === 'CANCELLED')?.count ?? 0;
    if (totalVo >= 10 && cancelled / totalVo > 0.1) {
      out.push({
        id: 'cancellations',
        severity: 'warning',
        title: `Cancellation rate is ${Math.round((cancelled / totalVo) * 100)}% this month`,
        description: `${cancelled} of ${totalVo} vendor orders in the last 30 days were cancelled.`,
        action: {
          label: 'Cancelled orders',
          href: '/admin/orders?status=CANCELLED',
        },
      });
    }
    if (totalVo >= 10 && refundsLast30.count / totalVo > 0.05) {
      out.push({
        id: 'refunds',
        severity: 'warning',
        title: `High refund rate: ${Math.round((refundsLast30.count / totalVo) * 100)}% in 30 days`,
        description: `${money(refundsLast30.amount)} refunded across ${refundsLast30.count} vendor orders.`,
        action: {
          label: 'Revenue & refunds',
          href: '/admin/analytics/revenue',
        },
      });
    }
    if (failsLast7 >= 5 && failsLast7 > failsPrev7 * 1.5) {
      out.push({
        id: 'failed-payments',
        severity: 'warning',
        title: `Failed payments are rising: ${failsLast7} this week`,
        description: `Up from ${failsPrev7} the week before. Check for card-testing or checkout issues.`,
        action: {
          label: 'Transactions',
          href: '/admin/analytics/revenue#transactions',
        },
      });
    }
    if (stripe > 0) {
      out.push({
        id: 'stripe-incomplete',
        severity: 'info',
        title: `${stripe} approved vendor${stripe === 1 ? " hasn't" : "s haven't"} finished Stripe setup`,
        description:
          'They can sell, but their earnings cannot be paid out until onboarding is complete.',
        action: {
          label: 'Vendor performance',
          href: '/admin/analytics/vendors?stripe=incomplete',
        },
      });
    }
    if (stock.out > 0) {
      out.push({
        id: 'out-of-stock',
        severity: 'info',
        title: `${stock.out} listed product${stock.out === 1 ? ' is' : 's are'} out of stock`,
        description: `${stock.low} more are running low across the marketplace.`,
        action: {
          label: 'Product analytics',
          href: '/admin/analytics/products',
        },
      });
    }
    for (const v of declining) {
      out.push({
        id: `declining-${String(v.id)}`,
        severity: 'info',
        title: `${String(v.storeName)} sales fell sharply`,
        description: `${money(num(v.cur))} in the last 30 days, down from ${money(num(v.prev))}.`,
        action: {
          label: 'Vendor performance',
          href: '/admin/analytics/vendors?performance=declining',
        },
      });
    }
    if (expiring > 0) {
      out.push({
        id: 'promotions-expiring',
        severity: 'info',
        title: `${expiring} featured listing${expiring === 1 ? '' : 's'} expire within 48 hours`,
        description: 'Featured slots on the homepage will open up.',
        action: { label: 'Promotions', href: '/admin/promotions' },
      });
    }
    const gmvChange = pctChange(gmvNow.gross, gmvPrev.gross);
    if (gmvChange !== null && gmvPrev.gross > 0 && Math.abs(gmvChange) >= 20) {
      const up = gmvChange > 0;
      out.push({
        id: 'gmv-trend',
        severity: up ? 'positive' : 'warning',
        title: `Marketplace GMV ${up ? 'up' : 'down'} ${Math.abs(Math.round(gmvChange))}% over 30 days`,
        description: `${money(gmvNow.gross)} in the last 30 days vs ${money(gmvPrev.gross)} in the 30 before.`,
        action: {
          label: 'Revenue analytics',
          href: '/admin/analytics/revenue',
        },
      });
    }
    return out.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
  }

  // ───── Activity ─────

  /**
   * Marketplace activity feed. Events that have their own table (orders,
   * registrations, products, refunds, promotions, payouts) are read from it
   * directly; ActivityLog contributes administrative actions and Stripe
   * incidents. Refund audit entries are skipped here because the refund row
   * itself already appears.
   */
  async activityFeed(limit: number) {
    const take = limit;
    const [
      logs,
      vendors,
      customers,
      products,
      orders,
      refunds,
      promos,
      payouts,
    ] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { action: { notIn: ['ORDER_REFUNDED'] } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.vendor.findMany({
        select: { id: true, storeName: true, createdAt: true, state: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.product.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
          vendor: { select: { storeName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.order.findMany({
        select: {
          id: true,
          createdAt: true,
          totalAmountCents: true,
          _count: { select: { vendorOrders: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.vendorOrder.findMany({
        where: { refundedAt: { not: null } },
        select: {
          id: true,
          orderId: true,
          status: true,
          refundedAt: true,
          subtotalCents: true,
          shippingCents: true,
          vendor: { select: { storeName: true } },
        },
        orderBy: { refundedAt: 'desc' },
        take,
      }),
      this.prisma.promotion.findMany({
        select: {
          id: true,
          type: true,
          createdAt: true,
          priceCents: true,
          vendor: { select: { storeName: true } },
          product: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.payout.findMany({
        select: {
          id: true,
          status: true,
          amountCents: true,
          createdAt: true,
          vendor: { select: { storeName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const actorIds = [
      ...new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id)),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const actorName = new Map(actors.map((a) => [a.id, a.name || a.email]));

    type FeedItem = {
      id: string;
      kind: string;
      title: string;
      description?: string;
      date: Date;
      href?: string;
      actor?: string | null;
    };
    const items: FeedItem[] = [
      ...logs.map((l) => ({
        id: `log-${l.id}`,
        kind: l.action,
        title: l.summary,
        date: l.createdAt,
        actor: l.actorId ? (actorName.get(l.actorId) ?? 'Admin') : 'System',
      })),
      ...vendors.map((v) => ({
        id: `vendor-${v.id}`,
        kind: 'VENDOR_REGISTERED',
        title: `${v.storeName} applied to sell`,
        description: v.state ? `Farm in ${normaliseState(v.state)}` : undefined,
        date: v.createdAt,
        href: '/admin/vendors',
      })),
      ...customers.map((c) => ({
        id: `customer-${c.id}`,
        kind: 'CUSTOMER_REGISTERED',
        title: 'New customer registered',
        date: c.createdAt,
      })),
      ...products.map((p) => ({
        id: `product-${p.id}`,
        kind: 'PRODUCT_CREATED',
        title: `${p.vendor.storeName} listed ${p.name}`,
        date: p.createdAt,
      })),
      ...orders.map((o) => ({
        id: `order-${o.id}`,
        kind: 'ORDER_PLACED',
        title: `Order #${o.id.slice(0, 8).toUpperCase()} placed`,
        description: `${money(o.totalAmountCents)} across ${o._count.vendorOrders} farm${o._count.vendorOrders === 1 ? '' : 's'}`,
        date: o.createdAt,
        href: `/admin/orders?order=${o.id}`,
      })),
      ...refunds.map((r) => ({
        id: `refund-${r.id}`,
        kind: r.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_REFUNDED',
        title: `${money(r.subtotalCents + r.shippingCents)} ${r.status === 'CANCELLED' ? 'cancelled and refunded' : 'refunded'}`,
        description: `${r.vendor.storeName} · order #${r.orderId.slice(0, 8).toUpperCase()}`,
        date: r.refundedAt as Date,
        href: `/admin/orders?order=${r.orderId}`,
      })),
      ...promos.map((p) => ({
        id: `promo-${p.id}`,
        kind: 'PROMOTION_PURCHASED',
        title: `${p.vendor.storeName} bought a featured listing`,
        description: `${p.type === 'FEATURED_PRODUCT' ? (p.product?.name ?? 'Product') : 'Store'} · ${money(p.priceCents)}`,
        date: p.createdAt,
        href: '/admin/promotions',
      })),
      ...payouts.map((p) => ({
        id: `payout-${p.id}`,
        kind: `PAYOUT_${p.status}`,
        title: `Payout to ${p.vendor.storeName} ${p.status === 'COMPLETED' ? 'sent' : p.status === 'FAILED' ? 'failed' : 'pending'}`,
        description: money(p.amountCents),
        date: p.createdAt,
        href: '/admin/payouts',
      })),
    ];
    return items
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);
  }

  async auditLog(opts: { page: number; pageSize: number; action?: string }) {
    const where: Prisma.ActivityLogWhereInput = opts.action
      ? { action: opts.action }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
    ]);
    const actorIds = [
      ...new Set(rows.map((l) => l.actorId).filter((id): id is string => !!id)),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      data: rows.map((r) => ({
        ...r,
        actor: r.actorId ? (byId.get(r.actorId) ?? null) : null,
      })),
    };
  }

  // ───── Exports ─────

  async exportCsv(report: AdminExport, range: ResolvedRange) {
    switch (report) {
      case 'revenue': {
        const data = await this.finance.marketplaceRevenue(range);
        return toCsv(data.series, [
          { header: 'Period', value: (p) => p.bucket },
          { header: 'GMV (AUD)', value: (p) => centsToDollars(p.gmv) },
          {
            header: 'Commission (AUD)',
            value: (p) => centsToDollars(p.commission),
          },
          {
            header: 'Promotion revenue (AUD)',
            value: (p) => centsToDollars(p.promotions),
          },
          {
            header: 'Platform revenue (AUD)',
            value: (p) => centsToDollars(p.platformRevenue),
          },
          { header: 'Orders', value: (p) => p.orders },
          {
            header: 'Previous GMV (AUD)',
            value: (p) => centsToDollars(p.prevGmv),
          },
          {
            header: 'Previous platform revenue (AUD)',
            value: (p) => centsToDollars(p.prevPlatformRevenue),
          },
        ]);
      }
      case 'vendors': {
        const { data } = await this.leaderboard(range, {
          sort: 'gmv',
          dir: 'desc',
          page: 1,
          pageSize: EXPORT_ROW_LIMIT,
        });
        return toCsv(data, [
          { header: 'Store', value: (v) => v.storeName },
          { header: 'Location', value: (v) => v.location },
          { header: 'State', value: (v) => v.state },
          { header: 'Status', value: (v) => v.status },
          { header: 'Stripe', value: (v) => v.stripe },
          {
            header: 'Registered',
            value: (v) => localDateTimeString(v.createdAt),
          },
          { header: 'Active products', value: (v) => v.products },
          { header: 'Orders', value: (v) => v.orders },
          { header: 'GMV (AUD)', value: (v) => centsToDollars(v.gmv) },
          {
            header: 'Commission (AUD)',
            value: (v) => centsToDollars(v.commission),
          },
          { header: 'AOV (AUD)', value: (v) => centsToDollars(v.aov) },
          {
            header: 'Previous GMV (AUD)',
            value: (v) => centsToDollars(v.prevGmv),
          },
          {
            header: 'Average rating',
            value: (v) => (v.rating === null ? '' : v.rating.toFixed(2)),
          },
          { header: 'Reviews', value: (v) => v.reviews },
        ]);
      }
      case 'orders': {
        const rows = await this.prisma.vendorOrder.findMany({
          where: { order: { createdAt: { gte: range.from, lt: range.to } } },
          orderBy: { order: { createdAt: 'desc' } },
          take: EXPORT_ROW_LIMIT,
          select: {
            id: true,
            orderId: true,
            status: true,
            subtotalCents: true,
            shippingCents: true,
            commissionCents: true,
            payoutCents: true,
            refundedAt: true,
            vendor: { select: { storeName: true } },
            order: {
              select: { createdAt: true, status: true, shippingState: true },
            },
          },
        });
        return toCsv(rows, [
          { header: 'Order ID', value: (r) => r.orderId },
          { header: 'Vendor order ID', value: (r) => r.id },
          {
            header: 'Date',
            value: (r) => localDateTimeString(r.order.createdAt),
          },
          { header: 'Vendor', value: (r) => r.vendor.storeName },
          {
            header: 'Customer state',
            value: (r) => normaliseState(r.order.shippingState),
          },
          {
            header: 'Merchandise (AUD)',
            value: (r) => centsToDollars(r.subtotalCents),
          },
          {
            header: 'Shipping (AUD)',
            value: (r) => centsToDollars(r.shippingCents),
          },
          {
            header: 'Commission (AUD)',
            value: (r) => centsToDollars(r.commissionCents),
          },
          {
            header: 'Vendor earnings (AUD)',
            value: (r) => centsToDollars(r.payoutCents),
          },
          { header: 'Vendor order status', value: (r) => r.status },
          { header: 'Order status', value: (r) => r.order.status },
          {
            header: 'Refunded at',
            value: (r) => localDateTimeString(r.refundedAt),
          },
        ]);
      }
      case 'products': {
        const rows = await this.sales.byProduct({}, range.from, range.to);
        return toCsv(rows, [
          { header: 'Product', value: (p) => p.name },
          { header: 'Vendor', value: (p) => p.storeName },
          { header: 'Category', value: (p) => p.category },
          { header: 'Items sold', value: (p) => p.items },
          { header: 'Orders', value: (p) => p.orders },
          { header: 'Revenue (AUD)', value: (p) => centsToDollars(p.revenue) },
          {
            header: 'Last sold',
            value: (p) => localDateTimeString(p.lastSoldAt),
          },
        ]);
      }
      case 'promotions': {
        const rows = await this.prisma.promotion.findMany({
          where: { createdAt: { gte: range.from, lt: range.to } },
          include: {
            vendor: { select: { storeName: true } },
            product: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: EXPORT_ROW_LIMIT,
        });
        return toCsv(rows, [
          {
            header: 'Purchased',
            value: (p) => localDateTimeString(p.createdAt),
          },
          { header: 'Vendor', value: (p) => p.vendor.storeName },
          { header: 'Type', value: (p) => p.type },
          { header: 'Product', value: (p) => p.product?.name },
          { header: 'Starts', value: (p) => localDateTimeString(p.startDate) },
          { header: 'Ends', value: (p) => localDateTimeString(p.endDate) },
          { header: 'Status', value: (p) => p.status },
          { header: 'Price (AUD)', value: (p) => centsToDollars(p.priceCents) },
          { header: 'Stripe payment', value: (p) => p.stripePaymentId },
        ]);
      }
      case 'customers': {
        // Aggregates only — no personal data leaves the platform in this export.
        const data = await this.customers.marketplaceCustomers(range);
        return toCsv(data.series, [
          { header: 'Period', value: (p) => p.bucket },
          { header: 'New registrations', value: (p) => p.registrations },
          { header: 'New buyers', value: (p) => p.newBuyers },
          { header: 'Returning buyers', value: (p) => p.returningBuyers },
        ]);
      }
    }
  }

  async productOverview(range: ResolvedRange) {
    const [data, stock] = await Promise.all([
      this.products.marketplaceProducts(range),
      this.inventory.marketplaceStockHealth(),
    ]);
    return { range: this.finance.rangeMeta(range), ...data, stock };
  }

  async promotionsOverview(range: ResolvedRange) {
    return {
      range: this.finance.rangeMeta(range),
      ...(await this.promotions.overview(range)),
    };
  }
}
