import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { PayoutInitiator } from '@prisma/client';
import { ActivityAction, ActivityActor, ActivityLogService } from '../activity/activity-log.service';
import { NotificationType, NotificationsService } from '../notifications/notifications.service';
import { AnalyticsCacheService } from '../analytics/cache/analytics-cache.service';

const DEFAULT_MIN_PAYOUT_CENTS = 5000; // $50 AUD, used only if admin hasn't set one yet

@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private notifications: NotificationsService,
    private activity: ActivityLogService,
    private analyticsCache: AnalyticsCacheService,
  ) {}

  async getBalance(userId: string) {
    const vendor = await this.getVendorByUserId(userId);
    const [availableCents, minPayoutCents] = await Promise.all([
      this.getAvailableBalanceCents(vendor.id),
      this.getMinPayoutCents(),
    ]);

    const stripeConnected = !!vendor.stripeAccount;
    const stripeOnboardingComplete =
      !!vendor.stripeAccount?.chargesEnabled &&
      !!vendor.stripeAccount?.payoutsEnabled;

    let blockedReason: string | null = null;
    if (!stripeConnected) {
      blockedReason = 'Connect your Stripe account to receive payouts.';
    } else if (!stripeOnboardingComplete) {
      blockedReason = 'Finish onboarding with Stripe to enable payouts.';
    } else if (availableCents <= 0) {
      blockedReason = 'No available balance to pay out yet.';
    } else if (availableCents < minPayoutCents) {
      blockedReason = `Balance is below the minimum payout amount of $${(minPayoutCents / 100).toFixed(2)}.`;
    }

    return {
      availableCents,
      minPayoutCents,
      stripeConnected,
      stripeOnboardingComplete,
      eligible: blockedReason === null,
      blockedReason,
    };
  }

  async getMyHistory(userId: string) {
    const vendor = await this.getVendorByUserId(userId);
    return this.prisma.payout.findMany({
      where: { vendorId: vendor.id },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllPayouts() {
    return this.prisma.payout.findMany({
      include: {
        vendor: { select: { id: true, storeName: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestPayoutForUser(userId: string) {
    const vendor = await this.getVendorByUserId(userId);
    return this.claimAndTransfer(vendor.id, {
      bypassMinimum: false,
      initiatedBy: PayoutInitiator.VENDOR,
    });
  }

  // Recovers a payout stuck at PENDING/FAILED (e.g. the process crashed
  // between claiming the orders and the Stripe transfer call actually
  // resolving) by re-attempting the transfer for the same already-claimed
  // orders and already-computed amount. Does not touch the claim itself —
  // only the initial attempt's failure path releases claimed orders, so a
  // retry keeps retrying against the same set until it succeeds.
  async retryPayout(payoutId: string, actor?: ActivityActor) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { vendor: { include: { stripeAccount: true } } },
    });
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }
    if (payout.status === 'COMPLETED') {
      throw new BadRequestException('This payout has already completed');
    }
    if (!payout.vendor.stripeAccount) {
      throw new BadRequestException('Vendor has no connected Stripe account');
    }

    try {
      const transfer = await this.stripeService.createTransfer({
        destinationAccountId: payout.vendor.stripeAccount.stripeAccountId,
        amountCents: payout.amountCents,
        transferGroup: payout.id,
        metadata: { payoutId: payout.id, vendorId: payout.vendorId },
      });

      const completed = await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          stripeTransferId: transfer.id,
          completedAt: new Date(),
        },
      });
      await this.afterPayout(completed, { actor, retry: true });
      return completed;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown error';
      const failed = await this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: 'FAILED', failureReason },
      });
      await this.afterPayout(failed, { actor, retry: true });
      return failed;
    }
  }

  async forcePayout(vendorId: string, actor?: ActivityActor) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return this.claimAndTransfer(vendorId, {
      bypassMinimum: true,
      initiatedBy: PayoutInitiator.ADMIN,
      actor,
    });
  }

  private async getVendorByUserId(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      include: { stripeAccount: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }
    return vendor;
  }

  private async getAvailableBalanceCents(vendorId: string): Promise<number> {
    const result = await this.prisma.vendorOrder.aggregate({
      where: { vendorId, payoutId: null, status: 'COMPLETED' },
      _sum: { payoutCents: true },
    });
    return result._sum.payoutCents || 0;
  }

  private async getMinPayoutCents(): Promise<number> {
    const config = await this.prisma.configuration.findUnique({
      where: { key: 'min_payout_amount_cents' },
    });
    const parsed = config ? parseInt(config.value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_MIN_PAYOUT_CENTS;
  }

  // Claims eligible VendorOrders for the vendor into a new Payout row (atomically, so
  // two concurrent requests can never claim the same order twice), then fires the live
  // Stripe transfer outside the DB transaction. On failure the claim is rolled back so
  // the balance becomes available again rather than being stuck in limbo.
  private async claimAndTransfer(
    vendorId: string,
    opts: { bypassMinimum: boolean; initiatedBy: PayoutInitiator; actor?: ActivityActor },
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { stripeAccount: true },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (!vendor.stripeAccount) {
      throw new BadRequestException(
        'Connect your Stripe account before requesting a payout',
      );
    }
    if (!vendor.stripeAccount.chargesEnabled || !vendor.stripeAccount.payoutsEnabled) {
      throw new BadRequestException(
        'Complete Stripe onboarding before requesting a payout',
      );
    }

    const minPayoutCents = await this.getMinPayoutCents();

    const payout = await this.prisma.$transaction(async (tx) => {
      const placeholder = await tx.payout.create({
        data: {
          vendorId,
          amountCents: 0,
          status: 'PENDING',
          initiatedBy: opts.initiatedBy,
        },
      });

      await tx.vendorOrder.updateMany({
        where: { vendorId, payoutId: null, status: 'COMPLETED' },
        data: { payoutId: placeholder.id },
      });

      const claimed = await tx.vendorOrder.findMany({
        where: { payoutId: placeholder.id },
        select: { payoutCents: true },
      });
      const amountCents = claimed.reduce((sum, o) => sum + o.payoutCents, 0);

      if (amountCents <= 0) {
        throw new BadRequestException('No available balance to pay out');
      }
      if (!opts.bypassMinimum && amountCents < minPayoutCents) {
        throw new BadRequestException(
          `Balance of $${(amountCents / 100).toFixed(2)} is below the $${(minPayoutCents / 100).toFixed(2)} minimum payout threshold`,
        );
      }

      return tx.payout.update({
        where: { id: placeholder.id },
        data: { amountCents },
      });
    });

    try {
      const transfer = await this.stripeService.createTransfer({
        destinationAccountId: vendor.stripeAccount.stripeAccountId,
        amountCents: payout.amountCents,
        transferGroup: payout.id,
        metadata: { payoutId: payout.id, vendorId },
      });

      const completed = await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          stripeTransferId: transfer.id,
          completedAt: new Date(),
        },
      });
      await this.afterPayout(completed, { actor: opts.actor, forced: opts.bypassMinimum });
      return completed;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown error';

      await this.prisma.$transaction([
        this.prisma.vendorOrder.updateMany({
          where: { payoutId: payout.id },
          data: { payoutId: null },
        }),
        this.prisma.payout.update({
          where: { id: payout.id },
          data: { status: 'FAILED', failureReason },
        }),
      ]);

      await this.afterPayout(
        { ...payout, status: 'FAILED', failureReason },
        { actor: opts.actor, forced: opts.bypassMinimum },
      );
      throw new BadRequestException(`Payout failed: ${failureReason}`);
    }
  }

  // Notifications, audit trail and analytics refresh after a transfer attempt.
  private async afterPayout(
    payout: { id: string; vendorId: string; amountCents: number; status: string; failureReason?: string | null },
    context: { actor?: ActivityActor; forced?: boolean; retry?: boolean },
  ) {
    this.analyticsCache.invalidateVendor(payout.vendorId);
    const amount = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
      payout.amountCents / 100,
    );
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: payout.vendorId },
      select: { storeName: true },
    });
    const storeName = vendor?.storeName ?? 'vendor';

    if (context.forced || context.retry) {
      await this.activity.record(context.actor ?? null, {
        action: context.retry ? ActivityAction.PAYOUT_RETRIED : ActivityAction.PAYOUT_FORCED,
        summary: `${context.retry ? 'Retried' : 'Forced'} payout of ${amount} to ${storeName} (${payout.status.toLowerCase()})`,
        entityType: 'Payout',
        entityId: payout.id,
      });
    }

    if (payout.status === 'COMPLETED') {
      await this.notifications.notifyVendor(payout.vendorId, {
        type: NotificationType.PAYOUT_COMPLETED,
        severity: 'success',
        title: `Payout of ${amount} sent`,
        body: 'Stripe will deposit it into your bank account on your usual payout schedule.',
        link: '/vendor/dashboard/payouts',
      });
      return;
    }

    await this.notifications.notifyVendor(payout.vendorId, {
      type: NotificationType.PAYOUT_FAILED,
      severity: 'warning',
      title: `Payout of ${amount} failed`,
      body: payout.failureReason ?? 'The transfer to Stripe did not go through.',
      link: '/vendor/dashboard/payouts',
    });
    await this.notifications.notifyAdmins({
      type: NotificationType.PAYOUT_FAILED,
      severity: 'critical',
      title: `Payout to ${storeName} failed`,
      body: `${amount}: ${payout.failureReason ?? 'unknown error'}`,
      link: '/admin/payouts',
    });
    if (!context.forced && !context.retry) {
      await this.activity.record(context.actor ?? null, {
        action: ActivityAction.PAYOUT_FAILED,
        summary: `Payout of ${amount} to ${storeName} failed: ${payout.failureReason ?? 'unknown error'}`,
        entityType: 'Payout',
        entityId: payout.id,
      });
    }
  }
}
