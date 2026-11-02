import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsCacheService } from '../analytics/cache/analytics-cache.service';
import { classifyStock } from '../analytics/services/inventory-analytics.service';
import {
  ActivityAction,
  ActivityActor,
  ActivityLogService,
} from '../activity/activity-log.service';
import {
  NotificationType,
  NotificationsService,
} from './notifications.service';

interface CreatedOrder {
  id: string;
  vendorOrders: Array<{
    id: string;
    vendorId: string;
    subtotalCents: number;
    items: Array<{
      productId: string;
      quantity: number;
      variant: { unitAmount: number } | null;
    }>;
  }>;
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
    cents / 100,
  );

/**
 * Side effects of marketplace events — dashboard notifications, audit log
 * entries and analytics cache invalidation — kept in one place so the
 * services that own the business logic only need a one-line call. Every
 * method is best-effort and never throws into the caller.
 */
@Injectable()
export class MarketplaceEventsService {
  private readonly logger = new Logger(MarketplaceEventsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private activity: ActivityLogService,
    private cache: AnalyticsCacheService,
  ) {}

  async orderCreated(order: CreatedOrder) {
    this.cache.invalidateVendors(order.vendorOrders.map((vo) => vo.vendorId));
    try {
      for (const vo of order.vendorOrders) {
        const items = vo.items.reduce((sum, i) => sum + i.quantity, 0);
        await this.notifications.notifyVendor(vo.vendorId, {
          type: NotificationType.ORDER_NEW,
          severity: 'success',
          title: `New order: ${money(vo.subtotalCents)}`,
          body: `${items} item${items === 1 ? '' : 's'} · order #${vo.id.slice(0, 8).toUpperCase()}`,
          link: `/vendor/dashboard/orders/${vo.id}`,
        });
      }
      await this.checkStockAfterSale(order);
    } catch (error) {
      this.logger.error(
        `orderCreated side effects failed for ${order.id}`,
        error as Error,
      );
    }
  }

  // Notifies only when a sale moves a product across a threshold (in stock →
  // low, or anything → out), so vendors get one alert rather than one per order.
  private async checkStockAfterSale(order: CreatedOrder) {
    const consumed = new Map<string, number>();
    for (const vo of order.vendorOrders) {
      for (const item of vo.items) {
        if (!item.variant) continue;
        consumed.set(
          item.productId,
          (consumed.get(item.productId) ?? 0) +
            item.variant.unitAmount * item.quantity,
        );
      }
    }
    if (consumed.size === 0) return;

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...consumed.keys()] } },
      select: {
        id: true,
        name: true,
        vendorId: true,
        isActive: true,
        stockAmount: true,
        variants: { select: { label: true, unitAmount: true, isActive: true } },
      },
    });
    for (const p of products) {
      const after = classifyStock(p);
      const before = classifyStock({
        ...p,
        stockAmount: p.stockAmount + (consumed.get(p.id) ?? 0),
      });
      if (after.state === 'out' && before.state !== 'out') {
        await this.notifications.notifyVendor(p.vendorId, {
          type: NotificationType.STOCK_OUT,
          severity: 'critical',
          title: `${p.name} is out of stock`,
          body: "Customers can't buy it until you add more stock.",
          link: '/vendor/dashboard/inventory?filter=out',
        });
      } else if (after.state === 'low' && before.state === 'in_stock') {
        await this.notifications.notifyVendor(p.vendorId, {
          type: NotificationType.STOCK_LOW,
          severity: 'warning',
          title: `${p.name} is running low`,
          body: after.smallestVariant
            ? `${after.sellableUnits} × ${after.smallestVariant.label} left.`
            : 'Only a little stock left.',
          link: '/vendor/dashboard/inventory?filter=low',
        });
      }
    }
  }

  async reconciliationFailed(
    paymentIntentId: string,
    refunded: boolean,
    error: unknown,
  ) {
    const reason = error instanceof Error ? error.message : String(error);
    await this.activity.record(null, {
      action: ActivityAction.ORDER_RECONCILIATION_FAILED,
      summary: refunded
        ? `Paid checkout ${paymentIntentId} could not become an order and was refunded automatically`
        : `Paid checkout ${paymentIntentId} could not become an order and the automatic refund FAILED`,
      entityType: 'PaymentIntent',
      entityId: paymentIntentId,
      metadata: { reason, refunded },
    });
    await this.notifications.notifyAdmins({
      type: NotificationType.ORDER_RECONCILIATION_FAILED,
      severity: refunded ? 'warning' : 'critical',
      title: refunded
        ? 'Checkout refunded automatically'
        : 'Customer charged with no order',
      body: refunded
        ? `Payment ${paymentIntentId} couldn't be turned into an order (${reason}) and was refunded.`
        : `Payment ${paymentIntentId} failed to create an order AND the refund failed. Refund it manually in Stripe.`,
      link: '/admin/analytics/revenue#transactions',
    });
  }

  /** Any vendor-order status/tracking change. */
  vendorOrderChanged(vendorId: string) {
    this.cache.invalidateVendor(vendorId);
  }

  async vendorOrderRefundedByAdmin(
    actor: ActivityActor,
    vendorOrder: {
      id: string;
      orderId: string;
      vendorId: string;
      subtotalCents: number;
      shippingCents: number;
    },
  ) {
    this.cache.invalidateVendor(vendorOrder.vendorId);
    const amount = money(vendorOrder.subtotalCents + vendorOrder.shippingCents);
    await this.activity.record(actor, {
      action: ActivityAction.ORDER_REFUNDED,
      summary: `Refunded ${amount} on order #${vendorOrder.orderId.slice(0, 8).toUpperCase()}`,
      entityType: 'VendorOrder',
      entityId: vendorOrder.id,
    });
    await this.notifications.notifyVendor(vendorOrder.vendorId, {
      type: NotificationType.ORDER_REFUNDED,
      severity: 'warning',
      title: `Order refunded by the marketplace: ${amount}`,
      body: 'An admin refunded this order. Stock has been restored and it no longer counts toward your earnings.',
      link: `/vendor/dashboard/orders/${vendorOrder.id}`,
    });
  }

  productChanged(vendorId: string) {
    this.cache.invalidateVendor(vendorId);
  }

  async vendorApplied(vendor: { id: string; storeName: string }) {
    this.cache.invalidateAdmin();
    await this.notifications.notifyAdmins({
      type: NotificationType.VENDOR_APPLICATION,
      title: `New vendor application: ${vendor.storeName}`,
      body: 'Review the farm and approve it so it can start selling.',
      link: '/admin/vendors',
    });
  }

  async promotionActivated(promotion: {
    vendorId: string;
    type: string;
    endDate: Date;
  }) {
    this.cache.invalidateVendor(promotion.vendorId);
    await this.notifications.notifyVendor(promotion.vendorId, {
      type: NotificationType.PROMOTION_ACTIVE,
      severity: 'success',
      title:
        promotion.type === 'FEATURED_VENDOR'
          ? 'Your store is now featured'
          : 'Your product is now featured',
      body: `Featured on the homepage until ${promotion.endDate.toLocaleDateString(
        'en-AU',
        {
          day: 'numeric',
          month: 'short',
          timeZone: process.env.REPORTING_TIMEZONE || 'Australia/Sydney',
        },
      )}.`,
      link: '/vendor/dashboard/promotions',
    });
  }

  async reviewCreated(review: {
    vendorId: string | null;
    rating: number;
    productName: string;
  }) {
    if (!review.vendorId) return;
    this.cache.invalidateVendor(review.vendorId);
    await this.notifications.notifyVendor(review.vendorId, {
      type: NotificationType.REVIEW_NEW,
      severity: review.rating <= 2 ? 'warning' : 'info',
      title: `New ${review.rating}-star review`,
      body: `On ${review.productName}`,
      link: '/vendor/dashboard/reviews',
    });
  }
}
