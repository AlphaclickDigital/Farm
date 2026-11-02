import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedRange, bucketKeys } from '../reporting/date-range';
import {
  COUNTED_SQL,
  bucketKeySql,
  fillSeries,
  metric,
  num,
  safeDiv,
  vendorFilter,
} from '../reporting/sql';
import { Scope } from './sales-analytics.service';

/** j***@example.com — enough to tell customers apart without exposing the address. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

@Injectable()
export class CustomerAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Buyers = users with at least one counted order (in scope). "New" buyers
   * placed their first-ever counted order (in scope) inside the window;
   * "returning" buyers ordered in the window and had ordered before it.
   */
  private async periodStats(scope: Scope, from: Date, to: Date) {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH firsts AS (
        SELECT o."userId", MIN(o."createdAt") AS first_at
        FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
        WHERE vo.status IN ${COUNTED_SQL} ${vendorFilter(scope.vendorId)}
        GROUP BY 1
      ),
      period AS (
        SELECT o."userId", SUM(vo."subtotalCents") AS spend, COUNT(DISTINCT vo."orderId") AS orders
        FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
        WHERE vo.status IN ${COUNTED_SQL} ${vendorFilter(scope.vendorId)}
          AND o."createdAt" >= ${from} AND o."createdAt" < ${to}
        GROUP BY 1
      )
      SELECT
        COUNT(*)::int AS buyers,
        COUNT(*) FILTER (WHERE f.first_at >= ${from})::int AS "newBuyers",
        COUNT(*) FILTER (WHERE f.first_at < ${from})::int AS returning,
        COALESCE(SUM(p.spend), 0)::bigint AS spend
      FROM period p JOIN firsts f ON f."userId" = p."userId"
    `;
    const buyers = num(row?.buyers);
    return {
      buyers,
      newBuyers: num(row?.newBuyers),
      returning: num(row?.returning),
      avgSpend: Math.round(safeDiv(num(row?.spend), buyers)),
    };
  }

  /** All-time buyer base in scope: size, repeat rate and lifetime value. */
  private async lifetimeStats(scope: Scope) {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH buyers AS (
        SELECT o."userId", COUNT(DISTINCT vo."orderId") AS orders, SUM(vo."subtotalCents") AS spend
        FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
        WHERE vo.status IN ${COUNTED_SQL} ${vendorFilter(scope.vendorId)}
        GROUP BY 1
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE orders >= 2)::int AS repeat,
        COUNT(*) FILTER (WHERE orders = 1)::int AS "bucket1",
        COUNT(*) FILTER (WHERE orders = 2)::int AS "bucket2",
        COUNT(*) FILTER (WHERE orders BETWEEN 3 AND 5)::int AS "bucket3to5",
        COUNT(*) FILTER (WHERE orders >= 6)::int AS "bucket6plus",
        COALESCE(SUM(spend), 0)::bigint AS spend
      FROM buyers
    `;
    const total = num(row?.total);
    return {
      totalBuyers: total,
      repeatBuyers: num(row?.repeat),
      repeatRate: safeDiv(num(row?.repeat), total) * 100,
      lifetimeValue: Math.round(safeDiv(num(row?.spend), total)),
      orderFrequency: [
        { label: '1 order', count: num(row?.bucket1) },
        { label: '2 orders', count: num(row?.bucket2) },
        { label: '3–5 orders', count: num(row?.bucket3to5) },
        { label: '6+ orders', count: num(row?.bucket6plus) },
      ],
    };
  }

  /** New vs returning buyers per bucket. */
  private async buyerSeries(scope: Scope, range: ResolvedRange) {
    const keys = bucketKeys(
      range.from,
      range.to,
      range.granularity,
      range.timezone,
    );
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string } & Record<string, unknown>>
    >`
      WITH firsts AS (
        SELECT o."userId", MIN(o."createdAt") AS first_at
        FROM "VendorOrder" vo JOIN "Order" o ON o.id = vo."orderId"
        WHERE vo.status IN ${COUNTED_SQL} ${vendorFilter(scope.vendorId)}
        GROUP BY 1
      ),
      orders AS (
        SELECT DISTINCT o."userId", ${bucketKeySql('o."createdAt"', range.granularity, range.timezone)} AS bucket,
          ${bucketKeySql('f.first_at', range.granularity, range.timezone)} AS first_bucket
        FROM "VendorOrder" vo
        JOIN "Order" o ON o.id = vo."orderId"
        JOIN firsts f ON f."userId" = o."userId"
        WHERE vo.status IN ${COUNTED_SQL} ${vendorFilter(scope.vendorId)}
          AND o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to}
      )
      SELECT bucket,
        COUNT(*) FILTER (WHERE bucket = first_bucket)::int AS "newBuyers",
        COUNT(*) FILTER (WHERE bucket <> first_bucket)::int AS "returningBuyers"
      FROM orders
      GROUP BY 1
    `;
    return fillSeries<{ newBuyers: number; returningBuyers: number }>(
      keys,
      rows,
      ['newBuyers', 'returningBuyers'],
    );
  }

  private async topCustomers(scope: Scope, limit: number) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT u.id, u.name, u.email,
        COUNT(DISTINCT vo."orderId")::int AS orders,
        COALESCE(SUM(vo."subtotalCents"), 0)::bigint AS spend,
        MIN(o."createdAt") AS "firstOrderAt",
        MAX(o."createdAt") AS "lastOrderAt"
      FROM "VendorOrder" vo
      JOIN "Order" o ON o.id = vo."orderId"
      JOIN "User" u ON u.id = o."userId"
      WHERE vo.status IN ${COUNTED_SQL} ${vendorFilter(scope.vendorId)}
      GROUP BY u.id
      ORDER BY spend DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      userId: String(r.id),
      name: (r.name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      orders: num(r.orders),
      spend: num(r.spend),
      firstOrderAt: r.firstOrderAt as Date,
      lastOrderAt: r.lastOrderAt as Date,
    }));
  }

  /** A vendor sees their own buyers by name, as they already do on orders. */
  async vendorCustomers(vendorId: string, range: ResolvedRange) {
    const scope = { vendorId };
    const [current, previous, lifetime, series, top, recent] =
      await Promise.all([
        this.periodStats(scope, range.from, range.to),
        this.periodStats(scope, range.prevFrom, range.prevTo),
        this.lifetimeStats(scope),
        this.buyerSeries(scope, range),
        this.topCustomers(scope, 10),
        this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT vo.id, vo."subtotalCents", vo.status::text AS status, o."createdAt", u.name,
          (SELECT MIN(o2."createdAt") FROM "VendorOrder" vo2 JOIN "Order" o2 ON o2.id = vo2."orderId"
            WHERE vo2."vendorId" = ${vendorId} AND o2."userId" = o."userId"
              AND vo2.status IN ${COUNTED_SQL}) AS "firstOrderAt"
        FROM "VendorOrder" vo
        JOIN "Order" o ON o.id = vo."orderId"
        JOIN "User" u ON u.id = o."userId"
        WHERE vo."vendorId" = ${vendorId}
        ORDER BY o."createdAt" DESC
        LIMIT 8
      `,
      ]);
    return {
      totalCustomers: lifetime.totalBuyers,
      customers: metric(current.buyers, previous.buyers),
      newCustomers: metric(current.newBuyers, previous.newBuyers),
      returningCustomers: metric(current.returning, previous.returning),
      avgSpend: metric(current.avgSpend, previous.avgSpend),
      repeatRate: lifetime.repeatRate,
      lifetimeValue: lifetime.lifetimeValue,
      orderFrequency: lifetime.orderFrequency,
      series,
      topCustomers: top,
      recentActivity: recent.map((r) => ({
        vendorOrderId: String(r.id),
        customerName: (r.name as string | null) ?? 'Customer',
        amount: num(r.subtotalCents),
        status: String(r.status),
        date: r.createdAt as Date,
        isFirstOrder:
          r.firstOrderAt instanceof Date &&
          (r.createdAt as Date).getTime() === r.firstOrderAt.getTime(),
      })),
    };
  }

  /** Marketplace customer analytics. Personal details are masked for admins. */
  async marketplaceCustomers(range: ResolvedRange) {
    const keys = bucketKeys(
      range.from,
      range.to,
      range.granularity,
      range.timezone,
    );
    const [
      current,
      previous,
      lifetime,
      series,
      top,
      registered,
      registrations,
      registrationSeries,
    ] = await Promise.all([
      this.periodStats({}, range.from, range.to),
      this.periodStats({}, range.prevFrom, range.prevTo),
      this.lifetimeStats({}),
      this.buyerSeries({}, range),
      this.topCustomers({}, 10),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      Promise.all([
        this.prisma.user.count({
          where: {
            role: 'CUSTOMER',
            createdAt: { gte: range.from, lt: range.to },
          },
        }),
        this.prisma.user.count({
          where: {
            role: 'CUSTOMER',
            createdAt: { gte: range.prevFrom, lt: range.prevTo },
          },
        }),
      ]),
      this.prisma.$queryRaw<
        Array<{ bucket: string } & Record<string, unknown>>
      >`
          SELECT ${bucketKeySql('u."createdAt"', range.granularity, range.timezone)} AS bucket,
            COUNT(*)::int AS registrations
          FROM "User" u
          WHERE u.role = 'CUSTOMER' AND u."createdAt" >= ${range.from} AND u."createdAt" < ${range.to}
          GROUP BY 1
        `,
    ]);
    const regSeries = fillSeries<{ registrations: number }>(
      keys,
      registrationSeries,
      ['registrations'],
    );
    return {
      registeredCustomers: registered,
      newRegistrations: metric(registrations[0], registrations[1]),
      buyers: metric(current.buyers, previous.buyers),
      newBuyers: metric(current.newBuyers, previous.newBuyers),
      returningBuyers: metric(current.returning, previous.returning),
      avgSpend: metric(current.avgSpend, previous.avgSpend),
      totalBuyers: lifetime.totalBuyers,
      repeatRate: lifetime.repeatRate,
      lifetimeValue: lifetime.lifetimeValue,
      orderFrequency: lifetime.orderFrequency,
      series: series.map((p, i) => ({
        ...p,
        registrations: regSeries[i]?.registrations ?? 0,
      })),
      topCustomers: top.map((c) => ({
        ...c,
        name: c.name ? c.name.split(' ')[0] : null,
        email: maskEmail(c.email),
      })),
    };
  }

  async registrationsBefore(date: Date) {
    return this.prisma.user.count({
      where: { role: 'CUSTOMER', createdAt: { lt: date } },
    });
  }
}
