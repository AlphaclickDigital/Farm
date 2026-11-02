import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REPORTING_TIMEZONE,
  ResolvedRange,
  bucketKeys,
  previousBucketKeys,
} from '../reporting/date-range';
import {
  bucketKeySql,
  fillSeries,
  metric,
  num,
  safeDiv,
} from '../reporting/sql';
import { SalesAnalyticsService } from './sales-analytics.service';

const DEFAULT_MIN_PAYOUT_CENTS = 5000; // mirrors PayoutsService

export const VENDOR_LEDGER_TYPES = ['all', 'sale', 'refund', 'payout'] as const;
export type VendorLedgerType = (typeof VENDOR_LEDGER_TYPES)[number];

export const ADMIN_TXN_TYPES = [
  'all',
  'charge',
  'refund',
  'payout',
  'promotion',
  'incident',
] as const;
export type AdminTxnType = (typeof ADMIN_TXN_TYPES)[number];

@Injectable()
export class FinanceAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesAnalyticsService,
  ) {}

  async minPayoutCents() {
    const config = await this.prisma.configuration.findUnique({
      where: { key: 'min_payout_amount_cents' },
    });
    const parsed = config ? parseInt(config.value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_MIN_PAYOUT_CENTS;
  }

  async refunds(vendorId: string | undefined, from: Date, to: Date) {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COUNT(*)::int AS count,
        COALESCE(SUM(vo."subtotalCents" + vo."shippingCents"), 0)::bigint AS amount,
        COALESCE(SUM(vo."commissionCents"), 0)::bigint AS commission
      FROM "VendorOrder" vo
      WHERE vo."refundedAt" >= ${from} AND vo."refundedAt" < ${to}
        ${vendorId ? Prisma.sql`AND vo."vendorId" = ${vendorId}` : Prisma.empty}
    `;
    return {
      count: num(row?.count),
      amount: num(row?.amount),
      commission: num(row?.commission),
    };
  }

  /**
   * Where every dollar a vendor has earned currently sits. These are
   * point-in-time balances, not range-bound:
   * - pending: counted orders not yet COMPLETED (not claimable yet)
   * - available: COMPLETED orders not yet in a payout (claimable now)
   * - inPayout: claimed by a payout still PENDING or FAILED (being retried)
   * - paidOut: transferred to Stripe by COMPLETED payouts
   */
  async vendorBalances(vendorId: string) {
    const [orders, payouts] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          COALESCE(SUM(vo."payoutCents") FILTER (
            WHERE vo."payoutId" IS NULL AND vo.status IN ('PAID','PROCESSING','SHIPPED')
          ), 0)::bigint AS pending,
          COALESCE(SUM(vo."payoutCents") FILTER (
            WHERE vo."payoutId" IS NULL AND vo.status = 'COMPLETED'
          ), 0)::bigint AS available,
          COALESCE(SUM(vo."payoutCents") FILTER (
            WHERE vo.status IN ('PAID','PROCESSING','SHIPPED','COMPLETED')
          ), 0)::bigint AS lifetime
        FROM "VendorOrder" vo
        WHERE vo."vendorId" = ${vendorId}
      `,
      this.prisma.payout.groupBy({
        by: ['status'],
        where: { vendorId },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);
    const sumFor = (status: string) =>
      payouts.find((p) => p.status === status)?._sum.amountCents ?? 0;
    const countFor = (status: string) =>
      payouts.find((p) => p.status === status)?._count ?? 0;
    return {
      pending: num(orders[0]?.pending),
      available: num(orders[0]?.available),
      lifetimeEarnings: num(orders[0]?.lifetime),
      inPayout: sumFor('PENDING') + sumFor('FAILED'),
      paidOut: sumFor('COMPLETED'),
      payoutsCompleted: countFor('COMPLETED'),
      payoutsOpen: countFor('PENDING') + countFor('FAILED'),
    };
  }

  async vendorFinance(vendorId: string, range: ResolvedRange) {
    const [
      current,
      previous,
      refunds,
      prevRefunds,
      series,
      balances,
      minPayout,
      stripe,
    ] = await Promise.all([
      this.sales.totals({ vendorId }, range.from, range.to),
      this.sales.totals({ vendorId }, range.prevFrom, range.prevTo),
      this.refunds(vendorId, range.from, range.to),
      this.refunds(vendorId, range.prevFrom, range.prevTo),
      this.sales.comparedSeries({ vendorId }, range),
      this.vendorBalances(vendorId),
      this.minPayoutCents(),
      this.prisma.stripeAccount.findUnique({
        where: { vendorId },
        select: {
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
        },
      }),
    ]);

    return {
      range: this.rangeMeta(range),
      breakdown: {
        grossSales: metric(current.gross, previous.gross),
        commission: metric(current.commission, previous.commission),
        shipping: metric(current.shipping, previous.shipping),
        netEarnings: metric(current.earnings, previous.earnings),
        refunds: {
          ...metric(refunds.amount, prevRefunds.amount),
          count: refunds.count,
        },
        effectiveCommissionRate:
          safeDiv(current.commission, current.gross) * 100,
        // Stripe card fees are charged to the platform account, never deducted
        // from vendor earnings, so there is no fee line for vendors.
        processingFees: null,
      },
      balances: { ...balances, minPayoutCents: minPayout },
      stripe: {
        connected: !!stripe,
        payoutsEnabled: !!stripe?.payoutsEnabled && !!stripe?.chargesEnabled,
        detailsSubmitted: !!stripe?.detailsSubmitted,
      },
      series: series.map((p) => ({
        bucket: p.bucket,
        earnings: p.earnings,
        commission: p.commission,
        gross: p.gross,
        prevEarnings: p.prevEarnings,
      })),
    };
  }

  /** Unified vendor ledger: sales, refunds and payouts, newest first. */
  async vendorLedger(
    vendorId: string,
    opts: {
      type: VendorLedgerType;
      from?: Date;
      to?: Date;
      page: number;
      pageSize: number;
    },
  ) {
    const typeFilter =
      opts.type === 'all'
        ? Prisma.empty
        : Prisma.sql`AND t.type = ${opts.type.toUpperCase()}`;
    const dateFilter =
      opts.from && opts.to
        ? Prisma.sql`AND t.date >= ${opts.from} AND t.date < ${opts.to}`
        : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT t.*, COUNT(*) OVER()::int AS "totalCount" FROM (
        SELECT 'SALE' AS type, vo.id, o."createdAt" AS date, vo."orderId" AS reference,
          vo."subtotalCents" AS gross, vo."commissionCents" AS commission, vo."shippingCents" AS shipping,
          CASE WHEN vo.status IN ('PAID','PROCESSING','SHIPPED','COMPLETED') THEN vo."payoutCents" ELSE 0 END AS net,
          vo.status::text AS status, vo."payoutId" AS "payoutId", u.name AS counterparty
        FROM "VendorOrder" vo
        JOIN "Order" o ON o.id = vo."orderId"
        JOIN "User" u ON u.id = o."userId"
        WHERE vo."vendorId" = ${vendorId}
        UNION ALL
        SELECT 'REFUND', vo.id, vo."refundedAt", vo."orderId",
          -vo."subtotalCents", 0, -vo."shippingCents", 0,
          vo.status::text, NULL, u.name
        FROM "VendorOrder" vo
        JOIN "Order" o ON o.id = vo."orderId"
        JOIN "User" u ON u.id = o."userId"
        WHERE vo."vendorId" = ${vendorId} AND vo."refundedAt" IS NOT NULL
        UNION ALL
        SELECT 'PAYOUT', p.id, COALESCE(p."completedAt", p."createdAt"), p."stripeTransferId",
          0, 0, 0, -p."amountCents", p.status::text, p.id, 'Stripe transfer'
        FROM "Payout" p
        WHERE p."vendorId" = ${vendorId}
      ) t
      WHERE true ${typeFilter} ${dateFilter}
      ORDER BY t.date DESC
      LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}
    `;
    return {
      total: num(rows[0]?.totalCount),
      page: opts.page,
      pageSize: opts.pageSize,
      data: rows.map((r) => ({
        type: String(r.type),
        id: String(r.id),
        date: r.date as Date,
        reference: (r.reference as string | null) ?? null,
        gross: num(r.gross),
        commission: num(r.commission),
        shipping: num(r.shipping),
        net: num(r.net),
        status: String(r.status),
        payoutId: (r.payoutId as string | null) ?? null,
        counterparty: (r.counterparty as string | null) ?? null,
      })),
    };
  }

  async promotionRevenue(from: Date, to: Date, vendorId?: string) {
    const result = await this.prisma.promotion.aggregate({
      where: {
        createdAt: { gte: from, lt: to },
        ...(vendorId && { vendorId }),
      },
      _sum: { priceCents: true },
      _count: true,
    });
    return { amount: result._sum.priceCents ?? 0, count: result._count };
  }

  async promotionSeries(
    range: ResolvedRange,
    from: Date,
    to: Date,
    keys: string[],
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string } & Record<string, unknown>>
    >`
      SELECT ${bucketKeySql('pr."createdAt"', range.granularity, range.timezone)} AS bucket,
        COALESCE(SUM(pr."priceCents"), 0)::bigint AS promotions
      FROM "Promotion" pr
      WHERE pr."createdAt" >= ${from} AND pr."createdAt" < ${to}
      GROUP BY 1
    `;
    return fillSeries<{ promotions: number }>(keys, rows, ['promotions']);
  }

  /** Marketplace revenue analytics: GMV vs platform revenue, by source. */
  async marketplaceRevenue(range: ResolvedRange) {
    const keys = bucketKeys(
      range.from,
      range.to,
      range.granularity,
      range.timezone,
    );
    const prevKeys = previousBucketKeys(range);
    const [
      cur,
      prev,
      promo,
      prevPromo,
      refunds,
      prevRefunds,
      sales,
      promoSeries,
      prevPromoSeries,
      commissionRate,
      monthly,
    ] = await Promise.all([
      this.sales.totals({}, range.from, range.to),
      this.sales.totals({}, range.prevFrom, range.prevTo),
      this.promotionRevenue(range.from, range.to),
      this.promotionRevenue(range.prevFrom, range.prevTo),
      this.refunds(undefined, range.from, range.to),
      this.refunds(undefined, range.prevFrom, range.prevTo),
      this.sales.comparedSeries({}, range),
      this.promotionSeries(range, range.from, range.to, keys),
      this.promotionSeries(range, range.prevFrom, range.prevTo, prevKeys),
      this.prisma.configuration.findUnique({
        where: { key: 'commission_rate' },
      }),
      this.monthlyComparison(),
    ]);

    const platform = cur.commission + promo.amount;
    const prevPlatform = prev.commission + prevPromo.amount;
    return {
      range: this.rangeMeta(range),
      gmv: metric(cur.gross, prev.gross),
      commission: metric(cur.commission, prev.commission),
      promotionRevenue: {
        ...metric(promo.amount, prevPromo.amount),
        count: promo.count,
      },
      platformRevenue: metric(platform, prevPlatform),
      refunds: {
        ...metric(refunds.amount, prevRefunds.amount),
        count: refunds.count,
      },
      orders: metric(cur.orders, prev.orders),
      aov: metric(cur.aov, prev.aov),
      shippingPassThrough: metric(cur.shipping, prev.shipping),
      vendorEarnings: metric(cur.earnings, prev.earnings),
      takeRate: {
        effective: safeDiv(platform, cur.gross) * 100,
        commissionEffective: safeDiv(cur.commission, cur.gross) * 100,
        configured: commissionRate
          ? parseFloat(commissionRate.value) * 100
          : null,
      },
      sources: [
        {
          source: 'commission',
          label: 'Sales commission',
          amount: cur.commission,
        },
        {
          source: 'promotions',
          label: 'Featured listings',
          amount: promo.amount,
        },
      ],
      series: sales.map((p, i) => ({
        bucket: p.bucket,
        gmv: p.gross,
        commission: p.commission,
        promotions: promoSeries[i]?.promotions ?? 0,
        platformRevenue: p.commission + (promoSeries[i]?.promotions ?? 0),
        orders: p.orders,
        prevGmv: p.prevGross,
        prevPlatformRevenue:
          p.prevCommission + (prevPromoSeries[i]?.promotions ?? 0),
        prevOrders: p.prevOrders,
      })),
      monthly,
    };
  }

  /** Last 12 calendar months (reporting timezone), independent of the range filter. */
  async monthlyComparison() {
    const tz = Prisma.raw(`'${REPORTING_TIMEZONE}'`);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH months AS (
        SELECT to_char(m, 'YYYY-MM') AS month
        FROM generate_series(
          date_trunc('month', (NOW() AT TIME ZONE ${tz})) - INTERVAL '11 months',
          date_trunc('month', (NOW() AT TIME ZONE ${tz})),
          INTERVAL '1 month'
        ) m
      ),
      sales AS (
        SELECT to_char((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM') AS month,
          SUM(vo."subtotalCents") AS gmv, SUM(vo."commissionCents") AS commission
        FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
        WHERE vo.status IN ('PAID','PROCESSING','SHIPPED','COMPLETED')
          AND o."createdAt" >= NOW() AT TIME ZONE 'UTC' - INTERVAL '13 months'
        GROUP BY 1
      ),
      promos AS (
        SELECT to_char((pr."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM') AS month,
          SUM(pr."priceCents") AS promotions
        FROM "Promotion" pr
        WHERE pr."createdAt" >= NOW() AT TIME ZONE 'UTC' - INTERVAL '13 months'
        GROUP BY 1
      )
      SELECT months.month,
        COALESCE(sales.gmv, 0)::bigint AS gmv,
        COALESCE(sales.commission, 0)::bigint AS commission,
        COALESCE(promos.promotions, 0)::bigint AS promotions
      FROM months
      LEFT JOIN sales ON sales.month = months.month
      LEFT JOIN promos ON promos.month = months.month
      ORDER BY months.month
    `;
    return rows.map((r) => ({
      month: String(r.month),
      gmv: num(r.gmv),
      commission: num(r.commission),
      promotions: num(r.promotions),
      platformRevenue: num(r.commission) + num(r.promotions),
    }));
  }

  /** Admin finance overview: money in, money out, and what is still owed. */
  async marketplaceFinance(range: ResolvedRange) {
    const [
      cur,
      promo,
      refunds,
      charged,
      payoutsDone,
      payoutsOpen,
      owed,
      incidents,
    ] = await Promise.all([
      this.sales.totals({}, range.from, range.to),
      this.promotionRevenue(range.from, range.to),
      this.refunds(undefined, range.from, range.to),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: range.from, lt: range.to } },
        _sum: { totalAmountCents: true },
        _count: true,
      }),
      this.prisma.payout.aggregate({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: range.from, lt: range.to },
        },
        _sum: { amountCents: true },
        _count: true,
      }),
      this.prisma.payout.groupBy({
        by: ['status'],
        where: { status: { in: ['PENDING', 'FAILED'] } },
        _sum: { amountCents: true },
        _count: true,
      }),
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT
          COALESCE(SUM(vo."payoutCents") FILTER (WHERE vo.status = 'COMPLETED'), 0)::bigint AS available,
          COALESCE(SUM(vo."payoutCents") FILTER (WHERE vo.status IN ('PAID','PROCESSING','SHIPPED')), 0)::bigint AS pending
        FROM "VendorOrder" vo
        WHERE vo."payoutId" IS NULL
      `,
      this.prisma.paymentIncident.groupBy({
        by: ['type'],
        where: { createdAt: { gte: range.from, lt: range.to } },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);
    const openDisputes = await this.prisma.paymentIncident.count({
      where: {
        type: 'DISPUTE',
        status: { notIn: ['won', 'lost', 'warning_closed', 'charge_refunded'] },
      },
    });
    const incident = (type: string) => incidents.find((i) => i.type === type);
    const open = (status: string) =>
      payoutsOpen.find((p) => p.status === status);

    return {
      range: this.rangeMeta(range),
      gmv: cur.gross,
      commission: cur.commission,
      promotionRevenue: promo.amount,
      platformRevenue: cur.commission + promo.amount,
      refunds,
      stripe: {
        // Everything captured from customers (merchandise + shipping) plus listing fees.
        chargedOrders: charged._sum.totalAmountCents ?? 0,
        chargedOrdersCount: charged._count,
        chargedPromotions: promo.amount,
        refunded: refunds.amount,
        transferredToVendors: payoutsDone._sum.amountCents ?? 0,
        transfersCount: payoutsDone._count,
      },
      payouts: {
        completedInRange: payoutsDone._sum.amountCents ?? 0,
        completedCount: payoutsDone._count,
        pending: open('PENDING')?._sum.amountCents ?? 0,
        pendingCount: open('PENDING')?._count ?? 0,
        failed: open('FAILED')?._sum.amountCents ?? 0,
        failedCount: open('FAILED')?._count ?? 0,
      },
      owedToVendors: {
        available: num(owed[0]?.available),
        pending: num(owed[0]?.pending),
      },
      failedPayments: {
        count: incident('PAYMENT_FAILED')?._count ?? 0,
        amount: incident('PAYMENT_FAILED')?._sum.amountCents ?? 0,
      },
      disputes: {
        count: incident('DISPUTE')?._count ?? 0,
        amount: incident('DISPUTE')?._sum.amountCents ?? 0,
        open: openDisputes,
      },
    };
  }

  /** Admin transaction log across every money movement the platform records. */
  async marketplaceTransactions(opts: {
    type: AdminTxnType;
    from?: Date;
    to?: Date;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const typeFilter =
      opts.type === 'all'
        ? Prisma.empty
        : Prisma.sql`AND t.type = ${opts.type.toUpperCase()}`;
    const dateFilter =
      opts.from && opts.to
        ? Prisma.sql`AND t.date >= ${opts.from} AND t.date < ${opts.to}`
        : Prisma.empty;
    const search = opts.q
      ? Prisma.sql`AND (t.reference ILIKE ${'%' + opts.q + '%'} OR t.party ILIKE ${'%' + opts.q + '%'} OR t.id ILIKE ${opts.q + '%'})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT t.*, COUNT(*) OVER()::int AS "totalCount" FROM (
        SELECT 'CHARGE' AS type, o.id, o."createdAt" AS date, o."stripePaymentId" AS reference,
          o."totalAmountCents" AS amount, o.status::text AS status, u.name AS party
        FROM "Order" o JOIN "User" u ON u.id = o."userId"
        UNION ALL
        SELECT 'REFUND', vo.id, vo."refundedAt", vo."stripeRefundId",
          -(vo."subtotalCents" + vo."shippingCents"), vo.status::text, v."storeName"
        FROM "VendorOrder" vo JOIN "Vendor" v ON v.id = vo."vendorId"
        WHERE vo."refundedAt" IS NOT NULL
        UNION ALL
        SELECT 'PAYOUT', p.id, COALESCE(p."completedAt", p."createdAt"), p."stripeTransferId",
          -p."amountCents", p.status::text, v."storeName"
        FROM "Payout" p JOIN "Vendor" v ON v.id = p."vendorId"
        UNION ALL
        SELECT 'PROMOTION', pr.id, pr."createdAt", pr."stripePaymentId",
          pr."priceCents", pr.status::text, v."storeName"
        FROM "Promotion" pr JOIN "Vendor" v ON v.id = pr."vendorId"
        UNION ALL
        SELECT 'INCIDENT', pi.id, pi."createdAt", COALESCE(pi."paymentIntentId", pi."stripeObjectId"),
          pi."amountCents", pi.type::text || ':' || pi.status, pi.reason
        FROM "PaymentIncident" pi
      ) t
      WHERE true ${typeFilter} ${dateFilter} ${search}
      ORDER BY t.date DESC
      LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}
    `;
    return {
      total: num(rows[0]?.totalCount),
      page: opts.page,
      pageSize: opts.pageSize,
      data: rows.map((r) => ({
        type: String(r.type),
        id: String(r.id),
        date: r.date as Date,
        reference: (r.reference as string | null) ?? null,
        amount: num(r.amount),
        status: String(r.status),
        party: (r.party as string | null) ?? null,
      })),
    };
  }

  rangeMeta(range: ResolvedRange) {
    return {
      preset: range.preset,
      from: range.from,
      to: range.to,
      prevFrom: range.prevFrom,
      prevTo: range.prevTo,
      startDate: range.startDate,
      endDate: range.endDate,
      granularity: range.granularity,
      timezone: range.timezone,
    };
  }
}
