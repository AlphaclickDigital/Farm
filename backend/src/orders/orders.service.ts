import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { EmailService } from '../email/email.service';
import { MarketplaceEventsService } from '../notifications/marketplace-events.service';
import { OrderStatus } from '@prisma/client';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';

// Never return password hashes (or other private columns) to API callers.
const publicUser = { select: { id: true, name: true, email: true } } as const;

// Statuses a vendor may move a VendorOrder to via the status endpoint. Forward
// only: a refunded or cancelled order can never be revived into the payout
// balance, and REFUNDED is reachable only through the refund endpoints.
const VENDOR_STATUS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ['PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'COMPLETED', 'CANCELLED'],
  SHIPPED: ['COMPLETED'],
};

const orderIncludes = {
  vendorOrders: {
    include: {
      vendor: true,
      items: {
        include: {
          product: { include: { images: true } },
          variant: true,
        },
      },
    },
  },
} as const;

const vendorOrderIncludes = {
  order: { include: { user: publicUser } },
  vendor: { include: { user: publicUser } },
  items: {
    include: {
      product: { include: { images: true } },
      variant: true,
    },
  },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private emailService: EmailService,
    private events: MarketplaceEventsService,
  ) {}

  async findCustomerOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: orderIncludes,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCustomerOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderIncludes,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  async findVendorOrders(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return this.prisma.vendorOrder.findMany({
      where: { vendorId: vendor.id },
      include: {
        order: { include: { user: publicUser } },
        items: {
          include: {
            product: { include: { images: true } },
            variant: true,
          },
        },
      },
      orderBy: { order: { createdAt: 'desc' } },
    });
  }

  async findVendorOrder(userId: string, vendorOrderId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: {
        order: { include: { user: publicUser } },
        items: {
          include: {
            product: { include: { images: true } },
            variant: true,
          },
        },
      },
    });

    if (!vendorOrder) {
      throw new NotFoundException('Order not found');
    }

    if (vendorOrder.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return vendorOrder;
  }

  async updateVendorOrderStatus(
    userId: string,
    vendorOrderId: string,
    status: OrderStatus,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
    });

    if (!vendorOrder) {
      throw new NotFoundException('Order not found');
    }

    if (vendorOrder.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (status === 'REFUNDED') {
      throw new BadRequestException(
        'Use the refund endpoint to refund an order — it also processes the actual Stripe refund, which a plain status change would not.',
      );
    }

    if (status === vendorOrder.status) {
      return this.prisma.vendorOrder.findUnique({
        where: { id: vendorOrderId },
        include: vendorOrderIncludes,
      });
    }

    if (!VENDOR_STATUS_TRANSITIONS[vendorOrder.status]?.includes(status)) {
      throw new BadRequestException(
        `An order that is ${vendorOrder.status} cannot be changed to ${status}.`,
      );
    }

    if (status === 'CANCELLED') {
      // Cancelling a paid order must give the customer their money back and
      // put the goods back on sale — not just relabel it.
      return this.performRefund(vendorOrderId, 'CANCELLED');
    }

    // Conditional on the status we validated against, so a concurrent change
    // (e.g. a refund) can't be overwritten.
    const { count } = await this.prisma.vendorOrder.updateMany({
      where: { id: vendorOrderId, status: vendorOrder.status },
      data: { status },
    });
    if (count !== 1) {
      throw new BadRequestException(
        'This order was updated by someone else. Refresh and try again.',
      );
    }

    const updated = await this.prisma.vendorOrder.findUniqueOrThrow({
      where: { id: vendorOrderId },
      include: vendorOrderIncludes,
    });

    await this.syncParentOrderStatus(updated.orderId);

    if (status !== vendorOrder.status) {
      await this.notifyOrderStatusChange(updated, status);
    }
    this.events.vendorOrderChanged(updated.vendorId);

    return updated;
  }

  async updateTracking(
    userId: string,
    vendorOrderId: string,
    trackingNumber: string,
    trackingUrl?: string,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
    });

    if (!vendorOrder) {
      throw new NotFoundException('Order not found');
    }

    if (vendorOrder.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (!['PAID', 'PROCESSING', 'SHIPPED'].includes(vendorOrder.status)) {
      throw new BadRequestException(
        `Tracking can't be added to an order that is ${vendorOrder.status}.`,
      );
    }

    // Only auto-advance to SHIPPED on first-time tracking; edits leave status alone
    const willShip = !vendorOrder.trackingNumber;

    const updated = await this.prisma.vendorOrder.update({
      where: { id: vendorOrderId },
      data: {
        trackingNumber,
        trackingUrl: trackingUrl || null,
        ...(willShip && { status: 'SHIPPED' }),
      },
      include: vendorOrderIncludes,
    });

    await this.syncParentOrderStatus(updated.orderId);

    if (willShip) {
      await this.notifyOrderStatusChange(updated, 'SHIPPED');
    }
    this.events.vendorOrderChanged(updated.vendorId);

    return updated;
  }

  async updateShippingAddress(
    userId: string,
    vendorOrderId: string,
    dto: UpdateShippingAddressDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
    });
    if (!vendorOrder) throw new NotFoundException('Order not found');
    if (vendorOrder.vendorId !== vendor.id)
      throw new ForbiddenException('You do not have access to this order');

    await this.prisma.order.update({
      where: { id: vendorOrder.orderId },
      data: {
        ...(dto.shippingName !== undefined && { shippingName: dto.shippingName }),
        ...(dto.shippingAddress !== undefined && { shippingAddress: dto.shippingAddress }),
        ...(dto.shippingCity !== undefined && { shippingCity: dto.shippingCity }),
        ...(dto.shippingState !== undefined && { shippingState: dto.shippingState }),
        ...(dto.shippingZip !== undefined && { shippingZip: dto.shippingZip }),
        ...(dto.shippingPhone !== undefined && { shippingPhone: dto.shippingPhone }),
      },
    });

    return this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: {
        order: { include: { user: publicUser } },
        items: {
          include: {
            product: { include: { images: true } },
            variant: true,
          },
        },
      },
    });
  }

  async getVendorStats(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const orders = await this.prisma.vendorOrder.findMany({
      where: { vendorId: vendor.id, status: { not: 'CANCELLED' } },
      include: {
        order: { include: { user: publicUser } },
        items: {
          include: {
            product: { include: { images: true } },
            variant: true,
          },
        },
      },
      orderBy: { order: { createdAt: 'desc' } },
    });

    const totalRevenueCents = orders.reduce((sum, o) => sum + o.payoutCents, 0);

    const now = new Date();
    const monthlyRevenue: { name: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString('en-AU', { month: 'short' });
      const year = d.getFullYear();
      const month = d.getMonth();
      const total = orders
        .filter((o) => {
          const created = new Date(o.order.createdAt);
          return created.getFullYear() === year && created.getMonth() === month;
        })
        .reduce((sum, o) => sum + o.payoutCents, 0);
      monthlyRevenue.push({ name: monthName, total: Math.round(total / 100) });
    }

    const recentOrders = orders.slice(0, 5).map((o) => ({
      id: o.id,
      customerName: o.order.user.name,
      customerEmail: o.order.user.email,
      payoutCents: o.payoutCents,
      status: o.status,
      createdAt: o.order.createdAt,
    }));

    return {
      totalRevenueCents,
      totalOrders: orders.length,
      monthlyRevenue,
      recentOrders,
    };
  }

  // ───── Refunds ─────

  async refundVendorOrderAsVendor(userId: string, vendorOrderId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
    });
    if (!vendorOrder) throw new NotFoundException('Order not found');
    if (vendorOrder.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return this.performRefund(vendorOrderId);
  }

  async refundVendorOrderAsAdmin(vendorOrderId: string, actor?: { userId: string; role: string }) {
    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
    });
    if (!vendorOrder) throw new NotFoundException('Order not found');

    const refunded = await this.performRefund(vendorOrderId);
    await this.events.vendorOrderRefundedByAdmin(actor ?? {}, vendorOrder);
    return refunded;
  }

  // Refunds the vendor's share (subtotal + shipping) through Stripe and puts
  // the stock back. Used for refunds (final status REFUNDED) and for vendor
  // cancellations (final status CANCELLED, which keeps stripeRefundId/refundedAt).
  private async performRefund(
    vendorOrderId: string,
    finalStatus: 'REFUNDED' | 'CANCELLED' = 'REFUNDED',
  ) {
    const vendorOrder = await this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: vendorOrderIncludes,
    });
    if (!vendorOrder) throw new NotFoundException('Order not found');

    if (vendorOrder.status === 'REFUNDED') {
      throw new BadRequestException('This order has already been refunded');
    }
    if (vendorOrder.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled orders cannot be refunded');
    }
    if (vendorOrder.payoutId) {
      throw new BadRequestException(
        'This order has already been paid out to the vendor and cannot be refunded here.',
      );
    }

    const previousStatus = vendorOrder.status;

    // Claim the order before touching Stripe. The conditional update means
    // only one of several concurrent refund/cancel requests can proceed, so
    // the customer is never refunded twice (multi-vendor orders would let
    // Stripe accept a second partial refund) and stock is restored once. It
    // also excludes orders a payout has claimed in the meantime.
    const claim = await this.prisma.vendorOrder.updateMany({
      where: { id: vendorOrderId, status: previousStatus, payoutId: null },
      data: { status: finalStatus, refundedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new BadRequestException(
        'This order was updated by another request. Refresh and try again.',
      );
    }

    const refundAmountCents = vendorOrder.subtotalCents + vendorOrder.shippingCents;

    let refund;
    try {
      refund = await this.stripeService.createRefund({
        paymentIntentId: vendorOrder.order.stripePaymentId,
        amountCents: refundAmountCents,
        metadata: { vendorOrderId: vendorOrder.id },
      });
    } catch (error) {
      await this.prisma.vendorOrder.update({
        where: { id: vendorOrderId },
        data: { status: previousStatus, refundedAt: null },
      });
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Refund failed: ${reason}`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of vendorOrder.items) {
        if (!item.variantId) continue;
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
        });
        if (variant) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockAmount: { increment: variant.unitAmount * item.quantity } },
          });
        }
      }

      await tx.vendorOrder.update({
        where: { id: vendorOrderId },
        data: { stripeRefundId: refund.id },
      });
    });

    await this.syncParentOrderStatus(vendorOrder.orderId);
    await this.notifyOrderStatusChange(vendorOrder, finalStatus);
    this.events.vendorOrderChanged(vendorOrder.vendorId);

    return this.prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: vendorOrderIncludes,
    });
  }

  // ───── Parent order status rollup ─────

  private async syncParentOrderStatus(orderId: string) {
    const vendorOrders = await this.prisma.vendorOrder.findMany({
      where: { orderId },
      select: { status: true },
    });

    const nextStatus = this.computeOrderStatus(vendorOrders.map((vo) => vo.status));

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
    });
  }

  // The parent Order spans every vendor in the cart, so its status reflects
  // the least-progressed active (non-cancelled) VendorOrder. CANCELLED orders
  // are excluded from that calculation; if every VendorOrder was cancelled,
  // the parent is CANCELLED too.
  private computeOrderStatus(statuses: OrderStatus[]): OrderStatus {
    const active = statuses.filter((s) => s !== 'CANCELLED');

    if (active.length === 0) return 'CANCELLED';
    if (active.every((s) => s === 'REFUNDED')) return 'REFUNDED';
    if (active.every((s) => s === 'COMPLETED' || s === 'REFUNDED')) return 'COMPLETED';
    if (active.every((s) => ['SHIPPED', 'COMPLETED', 'REFUNDED'].includes(s))) return 'SHIPPED';
    if (active.every((s) => ['PROCESSING', 'SHIPPED', 'COMPLETED', 'REFUNDED'].includes(s))) {
      return 'PROCESSING';
    }
    return 'PAID';
  }

  // ───── Email notifications (best-effort, never block the request) ─────

  private async notifyOrderStatusChange(
    vendorOrder: {
      id: string;
      order: { id: string; user: { email: string; name: string | null } };
      vendor: { storeName: string };
    },
    newStatus: OrderStatus,
  ) {
    try {
      await this.emailService.sendOrderStatusUpdate({
        customerEmail: vendorOrder.order.user.email,
        customerName: vendorOrder.order.user.name || 'there',
        orderId: vendorOrder.order.id,
        newStatus,
        vendorName: vendorOrder.vendor.storeName,
      });
    } catch (error) {
      console.error('Failed to send order status update email:', error);
    }
  }
}
