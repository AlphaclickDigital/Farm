import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const NotificationType = {
  ORDER_NEW: 'ORDER_NEW',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_REFUNDED: 'ORDER_REFUNDED',
  STOCK_LOW: 'STOCK_LOW',
  STOCK_OUT: 'STOCK_OUT',
  REVIEW_NEW: 'REVIEW_NEW',
  PROMOTION_ACTIVE: 'PROMOTION_ACTIVE',
  PROMOTION_EXPIRED: 'PROMOTION_EXPIRED',
  PROMOTION_CANCELLED: 'PROMOTION_CANCELLED',
  PAYOUT_COMPLETED: 'PAYOUT_COMPLETED',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
  VENDOR_APPROVED: 'VENDOR_APPROVED',
  VENDOR_REJECTED: 'VENDOR_REJECTED',
  VENDOR_SUSPENDED: 'VENDOR_SUSPENDED',
  VENDOR_APPLICATION: 'VENDOR_APPLICATION',
  PAYMENT_DISPUTE: 'PAYMENT_DISPUTE',
  ORDER_RECONCILIATION_FAILED: 'ORDER_RECONCILIATION_FAILED',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  severity?: NotificationSeverity;
}

// All notify* methods are best-effort: a failure to record a notification is
// logged and swallowed so it can never break the order/payout/etc. flow that
// triggered it.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async notifyUser(userId: string, input: NotificationInput) {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          severity: input.severity ?? 'info',
          ...this.fields(input),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create ${input.type} notification`,
        error as Error,
      );
    }
  }

  async notifyVendor(vendorId: string, input: NotificationInput) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { userId: true },
      });
      if (vendor) await this.notifyUser(vendor.userId, input);
    } catch (error) {
      this.logger.error(`Failed to notify vendor ${vendorId}`, error as Error);
    }
  }

  async notifyAdmins(input: NotificationInput) {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      if (admins.length === 0) return;
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          severity: input.severity ?? 'info',
          ...this.fields(input),
        })),
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify admins (${input.type})`,
        error as Error,
      );
    }
  }

  async list(
    userId: string,
    opts: { page: number; pageSize: number; unreadOnly: boolean },
  ) {
    const where = { userId, ...(opts.unreadOnly && { readAt: null }) };
    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data, total, unread, page: opts.page, pageSize: opts.pageSize };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  // updateMany scoped by userId doubles as the ownership check.
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private fields(input: NotificationInput) {
    return {
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    };
  }
}
