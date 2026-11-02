import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { NotificationType, NotificationsService } from '../notifications/notifications.service';
import { ActivityAction, ActivityLogService } from '../activity/activity-log.service';
import { AnalyticsCacheService } from '../analytics/cache/analytics-cache.service';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notifications: NotificationsService,
    private activity: ActivityLogService,
    private analyticsCache: AnalyticsCacheService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.warn('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(stripeSecretKey || 'sk_test_dummy', {
      apiVersion: '2026-01-28.clover',
    });
  }

  async createConnectAccount(vendorId: string): Promise<{ accountId: string }> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { user: true, stripeAccount: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (vendor.stripeAccount) {
      throw new BadRequestException('Stripe account already exists for this vendor');
    }

    // Create Stripe Connect Account
    const account = await this.stripe.accounts.create({
      type: 'express',
      country: 'AU', // Australia
      email: vendor.user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
    });

    // Save to database
    await this.prisma.stripeAccount.create({
      data: {
        vendorId: vendor.id,
        stripeAccountId: account.id,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        detailsSubmitted: account.details_submitted || false,
        onboardingComplete: false,
      },
    });

    return { accountId: account.id };
  }

  async createAccountLink(vendorId: string): Promise<{ url: string }> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { stripeAccount: true },
    });

    if (!vendor?.stripeAccount) {
      throw new NotFoundException('Stripe account not found for this vendor');
    }

    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';

    const accountLink = await this.stripe.accountLinks.create({
      account: vendor.stripeAccount.stripeAccountId,
      refresh_url: `${frontendUrl}/vendor/dashboard/payouts?refresh=true`,
      return_url: `${frontendUrl}/vendor/dashboard/payouts?success=true`,
      type: 'account_onboarding',
    });

    return { url: accountLink.url };
  }

  async getAccountStatus(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { stripeAccount: true },
    });

    if (!vendor?.stripeAccount) {
      return {
        exists: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardingComplete: false,
      };
    }

    // Fetch latest status from Stripe
    const account = await this.stripe.accounts.retrieve(
      vendor.stripeAccount.stripeAccountId,
    );

    // Update database with latest info
    await this.prisma.stripeAccount.update({
      where: { id: vendor.stripeAccount.id },
      data: {
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        detailsSubmitted: account.details_submitted || false,
        onboardingComplete: (account.charges_enabled && account.payouts_enabled) || false,
      },
    });

    return {
      exists: true,
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      detailsSubmitted: account.details_submitted || false,
      onboardingComplete: (account.charges_enabled && account.payouts_enabled) || false,
    };
  }

  async createTransfer(params: {
    destinationAccountId: string;
    amountCents: number;
    transferGroup?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Transfer> {
    return this.stripe.transfers.create({
      amount: params.amountCents,
      currency: 'aud',
      destination: params.destinationAccountId,
      transfer_group: params.transferGroup,
      metadata: params.metadata,
    });
  }

  async createRefund(params: {
    paymentIntentId: string;
    amountCents: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Refund> {
    return this.stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      amount: params.amountCents,
      metadata: params.metadata,
    });
  }

  // Verifies and dispatches the webhook, then returns the parsed event so
  // the controller can trigger cross-module side effects (e.g. order
  // reconciliation in PaymentModule) without StripeModule depending on them.
  async handleWebhook(signature: string, body: Buffer): Promise<Stripe.Event> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle Connect account events
    switch (event.type) {
      case 'account.updated':
        const account = event.data.object as Stripe.Account;
        await this.updateAccountFromWebhook(account);
        break;

      case 'payment_intent.payment_failed':
        await this.recordPaymentFailure(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
        await this.recordDispute(event.data.object as Stripe.Dispute, event.type === 'charge.dispute.created');
        break;

      default:
        break;
    }

    return event;
  }

  // Failed attempts are keyed by PaymentIntent, so a customer retrying the
  // same checkout (or Stripe redelivering the event) updates one row instead
  // of inflating the failure count. Admins see these via dashboard alerts
  // when failures spike, not a notification per declined card.
  private async recordPaymentFailure(intent: Stripe.PaymentIntent) {
    const error = intent.last_payment_error;
    await this.prisma.paymentIncident.upsert({
      where: { stripeObjectId: intent.id },
      create: {
        type: 'PAYMENT_FAILED',
        stripeObjectId: intent.id,
        paymentIntentId: intent.id,
        amountCents: intent.amount,
        status: error?.decline_code ?? error?.code ?? 'failed',
        reason: error?.message ?? null,
        userId: intent.metadata?.userId || null,
      },
      update: {
        status: error?.decline_code ?? error?.code ?? 'failed',
        reason: error?.message ?? null,
      },
    });
    this.analyticsCache.invalidateAdmin();
  }

  private async recordDispute(dispute: Stripe.Dispute, isNew: boolean) {
    const paymentIntentId =
      typeof dispute.payment_intent === 'string' ? dispute.payment_intent : (dispute.payment_intent?.id ?? null);
    const existing = await this.prisma.paymentIncident.findUnique({
      where: { stripeObjectId: dispute.id },
      select: { id: true },
    });
    await this.prisma.paymentIncident.upsert({
      where: { stripeObjectId: dispute.id },
      create: {
        type: 'DISPUTE',
        stripeObjectId: dispute.id,
        paymentIntentId,
        amountCents: dispute.amount,
        status: dispute.status,
        reason: dispute.reason,
      },
      update: { status: dispute.status, reason: dispute.reason, amountCents: dispute.amount },
    });
    this.analyticsCache.invalidateAdmin();

    // Notify once, on the first delivery we see for this dispute.
    if (isNew || !existing) {
      const amount = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
        dispute.amount / 100,
      );
      await this.activity.record(null, {
        action: ActivityAction.PAYMENT_DISPUTE,
        summary: `Customer disputed a ${amount} payment (${dispute.reason})`,
        entityType: 'Dispute',
        entityId: dispute.id,
        metadata: { paymentIntentId, status: dispute.status },
      });
      await this.notifications.notifyAdmins({
        type: NotificationType.PAYMENT_DISPUTE,
        severity: 'critical',
        title: `Payment dispute: ${amount}`,
        body: `Reason: ${dispute.reason.replace(/_/g, ' ')}. Respond in the Stripe Dashboard before the deadline.`,
        link: '/admin/analytics/revenue#finance',
      });
    }
  }

  private async updateAccountFromWebhook(account: Stripe.Account) {
    const stripeAccount = await this.prisma.stripeAccount.findUnique({
      where: { stripeAccountId: account.id },
    });

    if (stripeAccount) {
      await this.prisma.stripeAccount.update({
        where: { id: stripeAccount.id },
        data: {
          chargesEnabled: account.charges_enabled || false,
          payoutsEnabled: account.payouts_enabled || false,
          detailsSubmitted: account.details_submitted || false,
          onboardingComplete: (account.charges_enabled && account.payouts_enabled) || false,
        },
      });
    }
  }
}
