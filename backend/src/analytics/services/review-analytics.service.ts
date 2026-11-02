import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedRange, daysAgo } from '../reporting/date-range';
import { metric, num } from '../reporting/sql';

@Injectable()
export class ReviewAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async vendorReviews(vendorId: string, range: ResolvedRange) {
    const [
      overall,
      distribution,
      inRange,
      prevRange,
      recent,
      byProduct,
      unanswered,
    ] = await Promise.all([
      this.prisma.review.aggregate({
        where: { vendorId },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { vendorId },
        _count: true,
      }),
      this.prisma.review.aggregate({
        where: { vendorId, createdAt: { gte: range.from, lt: range.to } },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.aggregate({
        where: {
          vendorId,
          createdAt: { gte: range.prevFrom, lt: range.prevTo },
        },
        _avg: { rating: true },
        _count: true,
      }),
      this.prisma.review.findMany({
        where: { vendorId },
        include: {
          user: { select: { name: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT p.id, p.name,
          AVG(r.rating)::float8 AS average,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE r.rating <= 2 AND r."createdAt" >= ${daysAgo(90)})::int AS "recentLow"
        FROM "Review" r JOIN "Product" p ON p.id = r."productId"
        WHERE r."vendorId" = ${vendorId}
        GROUP BY p.id
      `,
      this.prisma.review.count({ where: { vendorId, vendorReply: null } }),
    ]);

    const products = byProduct.map((r) => ({
      productId: String(r.id),
      name: String(r.name),
      average: num(r.average),
      count: num(r.count),
      recentLow: num(r.recentLow),
    }));

    return {
      average: overall._avg.rating ?? 0,
      total: overall._count,
      unanswered,
      inRange: {
        count: metric(inRange._count, prevRange._count),
        average: metric(inRange._avg.rating ?? 0, prevRange._avg.rating ?? 0),
      },
      distribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.find((d) => d.rating === stars)?._count ?? 0,
      })),
      recent: recent.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        customerName: r.user.name ?? 'Customer',
        product: r.product,
        createdAt: r.createdAt,
        vendorReply: r.vendorReply,
        vendorRepliedAt: r.vendorRepliedAt,
      })),
      bestRated: products
        .filter((p) => p.average >= 4)
        .sort((a, b) => b.average - a.average || b.count - a.count)
        .slice(0, 5),
      needsAttention: products
        .filter((p) => p.average < 3.5 || p.recentLow > 0)
        .sort((a, b) => a.average - b.average)
        .slice(0, 5),
    };
  }
}
