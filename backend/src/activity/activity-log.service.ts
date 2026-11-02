import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ActivityAction = {
  VENDOR_APPROVED: 'VENDOR_APPROVED',
  VENDOR_REJECTED: 'VENDOR_REJECTED',
  VENDOR_SUSPENDED: 'VENDOR_SUSPENDED',
  VENDOR_UNSUSPENDED: 'VENDOR_UNSUSPENDED',
  VENDOR_UPDATED: 'VENDOR_UPDATED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  ORDER_REFUNDED: 'ORDER_REFUNDED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  PAYOUT_FORCED: 'PAYOUT_FORCED',
  PAYOUT_RETRIED: 'PAYOUT_RETRIED',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
  PROMOTION_STATUS_CHANGED: 'PROMOTION_STATUS_CHANGED',
  PROMOTION_EXPIRED: 'PROMOTION_EXPIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_DISPUTE: 'PAYMENT_DISPUTE',
  ORDER_RECONCILIATION_FAILED: 'ORDER_RECONCILIATION_FAILED',
} as const;
export type ActivityAction =
  (typeof ActivityAction)[keyof typeof ActivityAction];

export interface ActivityActor {
  userId?: string | null;
  role?: string | null;
}

export interface ActivityEntry {
  action: ActivityAction;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private prisma: PrismaService) {}

  // Best-effort like notifications: the audited action has already happened,
  // so a logging failure must not turn it into an error response.
  async record(actor: ActivityActor | null, entry: ActivityEntry) {
    try {
      await this.prisma.activityLog.create({
        data: {
          actorId: actor?.userId ?? null,
          actorRole: actor?.role ?? (actor ? null : 'SYSTEM'),
          action: entry.action,
          summary: entry.summary,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record activity ${entry.action}`,
        error as Error,
      );
    }
  }
}
