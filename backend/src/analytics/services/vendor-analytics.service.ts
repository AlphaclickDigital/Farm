import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ResolvedRange,
  daysAgo,
  localDateKey,
  localDateTimeString,
} from '../reporting/date-range';
import { metric, pctChange, safeDiv } from '../reporting/sql';
import { CsvColumn, centsToDollars, toCsv } from '../reporting/csv';
import { SalesAnalyticsService } from './sales-analytics.service';
import {
  InventoryAnalyticsService,
  InventoryRow,
} from './inventory-analytics.service';
import {
  ProductAnalyticsService,
  ProductFilter,
} from './product-analytics.service';
import { FinanceAnalyticsService } from './finance-analytics.service';

export type InsightSeverity = 'critical' | 'warning' | 'positive' | 'info';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
};

export const VENDOR_ORDER_SORTS = ['date', 'amount', 'status'] as const;
export const VENDOR_EXPORTS = [
  'sales',
  'orders',
  'products',
  'inventory',
  'earnings',
] as const;
export type VendorExport = (typeof VENDOR_EXPORTS)[number];

const EXPORT_ROW_LIMIT = 10_000;

const money = (cents: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    cents / 100,
  );

/** 1500 gram → "1.5 kg"; 12 piece → "12 pcs". */
export function formatBaseUnits(amount: number, baseUnit: string) {
  if (baseUnit === 'gram')
    return amount >= 1000 ? `${+(amount / 1000).toFixed(2)} kg` : `${amount} g`;
  if (baseUnit === 'ml')
    return amount >= 1000 ? `${+(amount / 1000).toFixed(2)} L` : `${amount} ml`;
  return `${amount} ${amount === 1 ? 'pc' : 'pcs'}`;
}

function payoutState(vo: {
  status: OrderStatus;
  payoutId: string | null;
  payout?: { status: string } | null;
}) {
  if (vo.status === 'REFUNDED') return 'refunded';
  if (vo.status === 'CANCELLED') return 'void';
  if (vo.payoutId)
    return vo.payout?.status === 'COMPLETED' ? 'paid_out' : 'in_payout';
  if (vo.status === 'COMPLETED') return 'available';
  return 'pending';
}

@Injectable()
export class VendorAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesAnalyticsService,
    private inventory: InventoryAnalyticsService,
    private products: ProductAnalyticsService,
    private finance: FinanceAnalyticsService,
  ) {}

  async summary(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        storeName: true,
        photo: true,
        location: true,
        state: true,
        isApproved: true,
        isSuspended: true,
        suspendedReason: true,
        createdAt: true,
        user: { select: { name: true } },
        stripeAccount: {
          select: {
            chargesEnabled: true,
            payoutsEnabled: true,
            detailsSubmitted: true,
          },
        },
        _count: { select: { products: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    const [balances, minPayoutCents] = await Promise.all([
      this.finance.vendorBalances(vendorId),
      this.finance.minPayoutCents(),
    ]);
    const stripeReady =
      !!vendor.stripeAccount?.chargesEnabled &&
      !!vendor.stripeAccount?.payoutsEnabled;
    return {
      id: vendor.id,
      storeName: vendor.storeName,
      ownerName: vendor.user.name,
      photo: vendor.photo,
      location: vendor.location,
      state: vendor.state,
      createdAt: vendor.createdAt,
      status: vendor.isSuspended
        ? 'suspended'
        : vendor.isApproved
          ? 'approved'
          : 'pending',
      suspendedReason: vendor.suspendedReason,
      productCount: vendor._count.products,
      stripe: {
        connected: !!vendor.stripeAccount,
        ready: stripeReady,
        detailsSubmitted: !!vendor.stripeAccount?.detailsSubmitted,
      },
      balances: { ...balances, minPayoutCents },
    };
  }

  async kpis(vendorId: string, range: ResolvedRange) {
    const [cur, prev, series, since] = await Promise.all([
      this.sales.totals({ vendorId }, range.from, range.to),
      this.sales.totals({ vendorId }, range.prevFrom, range.prevTo),
      this.sales.comparedSeries({ vendorId }, range),
      this.products.trackingSince(vendorId),
    ]);
    const [current, previous] = await Promise.all([
      this.conversion(vendorId, range.from, range.to, since),
      this.conversion(vendorId, range.prevFrom, range.prevTo, since),
    ]);
    const conversion = current.rate;
    const prevConversion = previous.rate;
    const views = current.views;

    return {
      range: this.finance.rangeMeta(range),
      kpis: {
        grossSales: {
          ...metric(cur.gross, prev.gross),
          spark: series.map((p) => p.gross),
        },
        orders: {
          ...metric(cur.orders, prev.orders),
          spark: series.map((p) => p.orders),
        },
        netEarnings: {
          ...metric(cur.earnings, prev.earnings),
          spark: series.map((p) => p.earnings),
        },
        aov: {
          ...metric(cur.aov, prev.aov),
          spark: series.map((p) => Math.round(safeDiv(p.gross, p.orders))),
        },
        itemsSold: {
          ...metric(cur.items, prev.items),
          spark: series.map((p) => p.items),
        },
        conversionRate: {
          value: conversion,
          previous: prevConversion,
          change:
            conversion !== null && prevConversion !== null
              ? pctChange(conversion, prevConversion)
              : null,
          views,
          trackingSince: since,
          // Set when tracking began part-way through the period.
          measuredFrom: current.partialFrom,
        },
      },
      customers: cur.customers,
    };
  }

  /** Orders ÷ product views, both counted only while view tracking existed. */
  private async conversion(
    vendorId: string,
    from: Date,
    to: Date,
    since: Date | null,
  ) {
    const start = this.products.conversionWindowStart(from, to, since);
    if (!start) return { rate: null, views: 0, partialFrom: null };
    const [views, totals] = await Promise.all([
      this.products.totalViews(
        vendorId,
        localDateKey(start),
        localDateKey(new Date(to.getTime() - 1)),
      ),
      this.sales.totals({ vendorId }, start, to),
    ]);
    return {
      rate: views > 0 ? safeDiv(totals.orders, views) * 100 : null,
      views,
      partialFrom: start > from ? start : null,
    };
  }

  async salesSeries(vendorId: string, range: ResolvedRange) {
    return {
      range: this.finance.rangeMeta(range),
      points: await this.sales.comparedSeries({ vendorId }, range),
    };
  }

  async breakdown(vendorId: string, range: ResolvedRange) {
    const [byProduct, byCategory, statuses, lowest] = await Promise.all([
      this.sales.byProduct({ vendorId }, range.from, range.to),
      this.sales.byCategory({ vendorId }, range.from, range.to),
      this.sales.statusBreakdown({ vendorId }, range.from, range.to),
      this.products.vendorProductPerformance(vendorId, range, {
        filter: 'lowest',
        page: 1,
        pageSize: 5,
      }),
    ]);
    const total = byProduct.reduce((sum, p) => sum + p.revenue, 0);
    const top = byProduct.slice(0, 5);
    const rest = byProduct.slice(5);
    const contribution = top.map((p) => ({
      productId: p.productId,
      name: p.name,
      revenue: p.revenue,
      share: safeDiv(p.revenue, total) * 100,
    }));
    if (rest.length) {
      const otherRevenue = rest.reduce((sum, p) => sum + p.revenue, 0);
      contribution.push({
        productId: 'other',
        name: `${rest.length} other product${rest.length === 1 ? '' : 's'}`,
        revenue: otherRevenue,
        share: safeDiv(otherRevenue, total) * 100,
      });
    }
    return {
      range: this.finance.rangeMeta(range),
      totalRevenue: total,
      byProduct: byProduct.slice(0, 10),
      byCategory,
      contribution,
      statuses,
      best: byProduct.slice(0, 5),
      lowest: lowest.data.map((p) => ({
        productId: p.productId,
        name: p.name,
        revenue: p.revenue,
        itemsSold: p.itemsSold,
        stockState: p.stockState,
      })),
    };
  }

  async orderInsights(vendorId: string, range: ResolvedRange) {
    const [statuses, pipeline, recent] = await Promise.all([
      this.sales.statusBreakdown({ vendorId }, range.from, range.to),
      this.sales.openPipeline({ vendorId }),
      this.listOrders(vendorId, {
        page: 1,
        pageSize: 6,
        sort: 'date',
        dir: 'desc',
      }),
    ]);
    return { statuses, pipeline, recent: recent.data };
  }

  // ───── Orders table ─────

  async listOrders(
    vendorId: string,
    opts: {
      page: number;
      pageSize: number;
      status?: string;
      q?: string;
      sort?: string;
      dir?: 'asc' | 'desc';
      from?: Date;
      to?: Date;
    },
  ) {
    const and: Prisma.VendorOrderWhereInput[] = [{ vendorId }];
    if (opts.from && opts.to)
      and.push({ order: { createdAt: { gte: opts.from, lt: opts.to } } });
    if (opts.q) {
      const q = opts.q.trim();
      const idPrefix = q.replace(/^#/, '').toLowerCase();
      and.push({
        OR: [
          { id: { startsWith: idPrefix } },
          { orderId: { startsWith: idPrefix } },
          { trackingNumber: { contains: q, mode: 'insensitive' } },
          { order: { user: { name: { contains: q, mode: 'insensitive' } } } },
          { order: { user: { email: { contains: q, mode: 'insensitive' } } } },
          {
            items: {
              some: { product: { name: { contains: q, mode: 'insensitive' } } },
            },
          },
        ],
      });
    }
    const countWhere: Prisma.VendorOrderWhereInput = { AND: and };
    const where: Prisma.VendorOrderWhereInput = {
      AND: [...and, ...this.statusWhere(opts.status)],
    };

    const dir = opts.dir === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.VendorOrderOrderByWithRelationInput[] =
      opts.sort === 'amount'
        ? [{ subtotalCents: dir }]
        : opts.sort === 'status'
          ? [{ status: dir }, { order: { createdAt: 'desc' } }]
          : [{ order: { createdAt: dir } }];

    const [total, rows, counts] = await Promise.all([
      this.prisma.vendorOrder.count({ where }),
      this.prisma.vendorOrder.findMany({
        where,
        orderBy,
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: {
          id: true,
          orderId: true,
          status: true,
          subtotalCents: true,
          shippingCents: true,
          commissionCents: true,
          payoutCents: true,
          shippingMethod: true,
          trackingNumber: true,
          payoutId: true,
          refundedAt: true,
          payout: { select: { status: true } },
          shippingOption: { select: { type: true } },
          order: {
            select: {
              createdAt: true,
              shippingCity: true,
              shippingState: true,
              user: { select: { name: true, email: true } },
            },
          },
          items: {
            select: {
              quantity: true,
              product: { select: { name: true } },
              variant: { select: { label: true } },
            },
          },
        },
      }),
      this.prisma.vendorOrder.groupBy({
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
      data: rows.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        status: r.status,
        createdAt: r.order.createdAt,
        customer: { name: r.order.user.name, email: r.order.user.email },
        destination:
          [r.order.shippingCity, r.order.shippingState]
            .filter(Boolean)
            .join(', ') || null,
        items: r.items.map((i) => ({
          name: i.product.name,
          variant: i.variant?.label ?? null,
          quantity: i.quantity,
        })),
        itemCount: r.items.reduce((sum, i) => sum + i.quantity, 0),
        subtotalCents: r.subtotalCents,
        shippingCents: r.shippingCents,
        commissionCents: r.commissionCents,
        payoutCents: r.payoutCents,
        shippingMethod: r.shippingMethod,
        isPickup: r.shippingOption?.type === 'PICKUP',
        trackingNumber: r.trackingNumber,
        refundedAt: r.refundedAt,
        payoutState: payoutState(r),
      })),
    };
  }

  private statusWhere(status?: string): Prisma.VendorOrderWhereInput[] {
    if (!status || status === 'all') return [];
    if (status === 'open') return [{ status: { in: ['PAID', 'PROCESSING'] } }];
    if (!(status in OrderStatus))
      throw new BadRequestException(`Unknown status "${status}"`);
    return [{ status: status as OrderStatus }];
  }

  // ───── Insights ─────

  async insights(vendorId: string, range: ResolvedRange): Promise<Insight[]> {
    const now = new Date();
    const [
      summary,
      cur,
      prev,
      inventory,
      pipeline,
      top30,
      reviews,
      activePromo,
    ] = await Promise.all([
      this.summary(vendorId),
      this.sales.totals({ vendorId }, range.from, range.to),
      this.sales.totals({ vendorId }, range.prevFrom, range.prevTo),
      this.inventory.vendorInventory(vendorId, now),
      this.sales.openPipeline({ vendorId }),
      this.sales.byProduct({ vendorId }, daysAgo(30, now), now, 1),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { vendorId, createdAt: { gte: daysAgo(30, now) } },
        _count: true,
      }),
      this.prisma.promotion.count({
        where: {
          vendorId,
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
    ]);
    const unanswered = await this.prisma.review.count({
      where: { vendorId, vendorReply: null },
    });

    const out: Insight[] = [];
    const rows = new Map(inventory.rows.map((r) => [r.productId, r]));

    if (summary.status === 'suspended') {
      out.push({
        id: 'store-suspended',
        severity: 'critical',
        title: 'Your store is suspended',
        description: summary.suspendedReason
          ? `Customers can't see your store. Reason: ${summary.suspendedReason}`
          : "Customers can't see your store. Contact support to resolve it.",
      });
    } else if (summary.status === 'pending') {
      out.push({
        id: 'store-pending',
        severity: 'info',
        title: 'Your store is awaiting approval',
        description:
          'You can keep adding products. They go live as soon as an admin approves your store.',
        action: {
          label: 'Add a product',
          href: '/vendor/dashboard/products/new',
        },
      });
    }

    if (!summary.stripe.ready) {
      out.push({
        id: 'stripe',
        severity: 'critical',
        title: summary.stripe.connected
          ? 'Finish your Stripe setup'
          : 'Connect Stripe to get paid',
        description:
          'Earnings build up in your balance, but payouts need a fully verified Stripe account.',
        action: { label: 'Set up payouts', href: '/vendor/dashboard/payouts' },
      });
    }

    if (pipeline.overdue > 0) {
      out.push({
        id: 'overdue-orders',
        severity: 'warning',
        title: `${pipeline.overdue} order${pipeline.overdue === 1 ? ' has' : 's have'} been waiting over 2 days`,
        description:
          'Ship or mark them ready so customers know their order is on its way.',
        action: {
          label: 'View open orders',
          href: '/vendor/dashboard/orders?status=open',
        },
      });
    }

    const topSeller = top30[0] ? rows.get(top30[0].productId) : undefined;
    if (topSeller && (topSeller.state === 'low' || topSeller.state === 'out')) {
      out.push({
        id: 'top-seller-stock',
        severity: 'warning',
        title:
          topSeller.state === 'out'
            ? `Your best seller, ${topSeller.name}, is out of stock`
            : `Your best seller, ${topSeller.name}, is running low`,
        description: this.stockSentence(topSeller),
        action: {
          label: 'Restock',
          href: '/vendor/dashboard/inventory?filter=low',
        },
      });
    }

    const outCount =
      inventory.summary.outOfStock - (topSeller?.state === 'out' ? 1 : 0);
    if (outCount > 0) {
      out.push({
        id: 'out-of-stock',
        severity: 'warning',
        title: `${outCount} active product${outCount === 1 ? ' is' : 's are'} out of stock`,
        description:
          "Customers can see them but can't buy them until you add stock.",
        action: {
          label: 'Review inventory',
          href: '/vendor/dashboard/inventory?filter=out',
        },
      });
    }

    for (const r of inventory.rows
      .filter((row) => row.highDemand)
      .slice(0, 2)) {
      out.push({
        id: `high-demand-${r.productId}`,
        severity: 'positive',
        title: `${r.name} is selling faster than usual`,
        description: `${r.sold7dItems} sold in the last 7 days. ${this.stockSentence(r)}`,
        action: { label: 'Check stock', href: '/vendor/dashboard/inventory' },
      });
    }

    const salesChange = pctChange(cur.gross, prev.gross);
    if (salesChange !== null && prev.gross > 0 && Math.abs(salesChange) >= 10) {
      const up = salesChange > 0;
      out.push({
        id: 'sales-trend',
        severity: up ? 'positive' : 'warning',
        title: `Sales ${up ? 'up' : 'down'} ${Math.abs(Math.round(salesChange))}% on the previous period`,
        description: `${money(cur.gross)} this period compared with ${money(prev.gross)} before.`,
        action: { label: 'See analytics', href: '/vendor/dashboard/analytics' },
      });
    }

    const aovChange = pctChange(cur.aov, prev.aov);
    if (
      aovChange !== null &&
      prev.orders >= 3 &&
      cur.orders >= 3 &&
      aovChange <= -10
    ) {
      out.push({
        id: 'aov-drop',
        severity: 'info',
        title: 'Average order value is down',
        description: `Down from ${money(prev.aov)} to ${money(cur.aov)}. A free-shipping threshold or multi-pack variants can encourage bigger baskets.`,
        action: {
          label: 'Shipping settings',
          href: '/vendor/dashboard/shipping',
        },
      });
    }

    if (inventory.summary.noRecentSales > 0) {
      const n = inventory.summary.noRecentSales;
      out.push({
        id: 'no-recent-sales',
        severity: 'info',
        title: `${n} product${n === 1 ? " hasn't" : "s haven't"} sold in 30 days`,
        description:
          'A discount, better photos or a featured listing could help them move.',
        action: {
          label: 'See lowest sellers',
          href: '/vendor/dashboard/analytics?filter=lowest',
        },
      });
    }

    const positive = reviews
      .filter((r) => r.rating >= 4)
      .reduce((s, r) => s + r._count, 0);
    const negative = reviews
      .filter((r) => r.rating <= 2)
      .reduce((s, r) => s + r._count, 0);
    if (negative > 0) {
      out.push({
        id: 'low-reviews',
        severity: 'warning',
        title: `${negative} low rating${negative === 1 ? '' : 's'} in the last 30 days`,
        description: 'A quick, helpful reply shows future customers you care.',
        action: {
          label: 'Respond to reviews',
          href: '/vendor/dashboard/reviews',
        },
      });
    } else if (positive > 0) {
      out.push({
        id: 'good-reviews',
        severity: 'positive',
        title: `${positive} new positive review${positive === 1 ? '' : 's'} this month`,
        description:
          'Customers are happy. Thanking them publicly builds loyalty.',
        action: { label: 'View reviews', href: '/vendor/dashboard/reviews' },
      });
    }
    if (unanswered > 0 && negative === 0) {
      out.push({
        id: 'unanswered-reviews',
        severity: 'info',
        title: `${unanswered} review${unanswered === 1 ? '' : 's'} without a reply`,
        description:
          'Replies appear publicly under the review on your product page.',
        action: {
          label: 'Reply now',
          href: '/vendor/dashboard/reviews?filter=unanswered',
        },
      });
    }

    const { available, minPayoutCents } = summary.balances;
    if (summary.stripe.ready && available >= minPayoutCents && available > 0) {
      out.push({
        id: 'payout-ready',
        severity: 'positive',
        title: `${money(available)} is ready to pay out`,
        description: 'Your balance is above the minimum payout amount.',
        action: { label: 'Request payout', href: '/vendor/dashboard/payouts' },
      });
    }

    if (
      top30[0] &&
      activePromo === 0 &&
      summary.status === 'approved' &&
      topSeller?.state === 'in_stock'
    ) {
      out.push({
        id: 'promote-best-seller',
        severity: 'info',
        title: `Feature ${top30[0].name} on the homepage`,
        description:
          'It is your best seller this month and has stock to spare. A featured listing puts it in front of more shoppers.',
        action: {
          label: 'Create promotion',
          href: '/vendor/dashboard/promotions',
        },
      });
    }

    return out
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .slice(0, 8);
  }

  private stockSentence(r: InventoryRow) {
    if (r.state === 'out') return 'No packs can be sold until you restock.';
    const packs = r.smallestVariant
      ? `${r.sellableUnits} × ${r.smallestVariant.label} left`
      : `${formatBaseUnits(r.stockAmount, r.baseUnit)} left`;
    const cover =
      r.daysOfCover !== null
        ? `, about ${Math.max(1, Math.round(r.daysOfCover))} days at the current rate`
        : '';
    return `${packs}${cover}.`;
  }

  // ───── Exports ─────

  async exportCsv(
    vendorId: string,
    report: VendorExport,
    range: ResolvedRange,
    filter?: ProductFilter,
  ) {
    switch (report) {
      case 'sales': {
        const points = await this.sales.comparedSeries({ vendorId }, range);
        return toCsv(points, [
          { header: 'Period', value: (p) => p.bucket },
          {
            header: 'Gross sales (AUD)',
            value: (p) => centsToDollars(p.gross),
          },
          { header: 'Orders', value: (p) => p.orders },
          { header: 'Items sold', value: (p) => p.items },
          {
            header: 'Commission (AUD)',
            value: (p) => centsToDollars(p.commission),
          },
          {
            header: 'Net earnings (AUD)',
            value: (p) => centsToDollars(p.earnings),
          },
          { header: 'Previous period', value: (p) => p.prevBucket },
          {
            header: 'Previous gross sales (AUD)',
            value: (p) => centsToDollars(p.prevGross),
          },
        ]);
      }
      case 'orders': {
        const { data } = await this.listOrders(vendorId, {
          page: 1,
          pageSize: EXPORT_ROW_LIMIT,
          from: range.from,
          to: range.to,
          sort: 'date',
          dir: 'desc',
        });
        return toCsv(data, [
          { header: 'Vendor order ID', value: (o) => o.id },
          { header: 'Order ID', value: (o) => o.orderId },
          { header: 'Date', value: (o) => localDateTimeString(o.createdAt) },
          { header: 'Customer', value: (o) => o.customer.name },
          { header: 'Customer email', value: (o) => o.customer.email },
          { header: 'Destination', value: (o) => o.destination },
          {
            header: 'Items',
            value: (o) =>
              o.items
                .map(
                  (i) =>
                    `${i.quantity} × ${i.name}${i.variant ? ` (${i.variant})` : ''}`,
                )
                .join('; '),
          },
          {
            header: 'Subtotal (AUD)',
            value: (o) => centsToDollars(o.subtotalCents),
          },
          {
            header: 'Shipping (AUD)',
            value: (o) => centsToDollars(o.shippingCents),
          },
          {
            header: 'Commission (AUD)',
            value: (o) => centsToDollars(o.commissionCents),
          },
          {
            header: 'Your earnings (AUD)',
            value: (o) => centsToDollars(o.payoutCents),
          },
          { header: 'Status', value: (o) => o.status },
          { header: 'Payout', value: (o) => o.payoutState },
          { header: 'Shipping method', value: (o) => o.shippingMethod },
          { header: 'Tracking number', value: (o) => o.trackingNumber },
        ]);
      }
      case 'products': {
        const { allRows } = await this.products.vendorProductPerformance(
          vendorId,
          range,
          {
            filter: filter ?? 'all',
            page: 1,
            pageSize: EXPORT_ROW_LIMIT,
          },
        );
        return toCsv(allRows, [
          { header: 'Product', value: (p) => p.name },
          { header: 'Category', value: (p) => p.category },
          { header: 'Active', value: (p) => (p.isActive ? 'Yes' : 'No') },
          { header: 'Items sold', value: (p) => p.itemsSold },
          { header: 'Orders', value: (p) => p.orders },
          { header: 'Revenue (AUD)', value: (p) => centsToDollars(p.revenue) },
          {
            header: 'Revenue share (%)',
            value: (p) => p.revenueShare.toFixed(1),
          },
          {
            header: 'Previous revenue (AUD)',
            value: (p) => centsToDollars(p.previousRevenue),
          },
          {
            header: 'Trend (%)',
            value: (p) => (p.trend === null ? 'new' : p.trend.toFixed(1)),
          },
          {
            header: 'Stock',
            value: (p) => formatBaseUnits(p.stockAmount, p.baseUnit),
          },
          { header: 'Stock status', value: (p) => p.stockState },
          { header: 'Views', value: (p) => p.views },
          {
            header: 'Conversion (%)',
            value: (p) =>
              p.conversionRate === null ? '' : p.conversionRate.toFixed(1),
          },
        ]);
      }
      case 'inventory': {
        const { rows } = await this.inventory.vendorInventory(vendorId);
        const columns: CsvColumn<InventoryRow>[] = [
          { header: 'Product', value: (r) => r.name },
          { header: 'Category', value: (r) => r.category },
          { header: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
          {
            header: 'Stock',
            value: (r) => formatBaseUnits(r.stockAmount, r.baseUnit),
          },
          { header: 'Stock (base units)', value: (r) => r.stockAmount },
          { header: 'Base unit', value: (r) => r.baseUnit },
          { header: 'Smallest pack', value: (r) => r.smallestVariant?.label },
          { header: 'Packs sellable', value: (r) => r.sellableUnits },
          { header: 'Status', value: (r) => r.state },
          { header: 'Items sold (30d)', value: (r) => r.sold30dItems },
          {
            header: 'Sold (30d)',
            value: (r) => formatBaseUnits(r.sold30dBaseUnits, r.baseUnit),
          },
          {
            header: 'Days of cover',
            value: (r) =>
              r.daysOfCover === null ? '' : Math.round(r.daysOfCover),
          },
          {
            header: 'Last sold',
            value: (r) => localDateTimeString(r.lastSoldAt),
          },
        ];
        return toCsv(rows, columns);
      }
      case 'earnings': {
        const { data } = await this.finance.vendorLedger(vendorId, {
          type: 'all',
          from: range.from,
          to: range.to,
          page: 1,
          pageSize: EXPORT_ROW_LIMIT,
        });
        return toCsv(data, [
          { header: 'Date', value: (t) => localDateTimeString(t.date) },
          { header: 'Type', value: (t) => t.type },
          { header: 'Reference', value: (t) => t.reference ?? t.id },
          { header: 'Customer / payee', value: (t) => t.counterparty },
          { header: 'Gross (AUD)', value: (t) => centsToDollars(t.gross) },
          {
            header: 'Commission (AUD)',
            value: (t) => centsToDollars(t.commission),
          },
          {
            header: 'Shipping (AUD)',
            value: (t) => centsToDollars(t.shipping),
          },
          { header: 'Net to you (AUD)', value: (t) => centsToDollars(t.net) },
          { header: 'Status', value: (t) => t.status },
        ]);
      }
    }
  }
}
