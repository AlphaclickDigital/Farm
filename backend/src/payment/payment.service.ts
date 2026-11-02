import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingCalculatorService } from '../vendors/shipping-calculator.service';
import { EmailService } from '../email/email.service';
import { MarketplaceEventsService } from '../notifications/marketplace-events.service';
import { effectivePriceCents } from '../products/product-pricing';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import {
  CreatePaymentIntentDto,
  CartItemDto,
  VendorShippingSelectionDto,
  ShippingAddressDto,
} from './dto/create-payment-intent.dto';

// Never return password hashes (or other private columns) to API callers.
const publicUser = { select: { id: true, name: true, email: true } } as const;

const orderWithRelations = {
  user: publicUser,
  vendorOrders: {
    include: {
      vendor: { include: { user: publicUser } },
      items: {
        include: {
          product: { include: { images: true } },
          variant: true,
        },
      },
    },
  },
} as const;

interface VendorShippingCost {
  cents: number;
  method: string | null;
  optionId: string | null;
}

// The checkout as validated and priced by createPaymentIntent. Order creation
// trusts this server-side record, never the items the client re-submits.
interface PendingOrderPayload {
  items: CartItemDto[];
  shippingSelections?: VendorShippingSelectionDto[] | null;
  shippingAddress?: ShippingAddressDto | null;
  // Absent on checkouts started before shipping was persisted here.
  vendorShipping?: Record<string, VendorShippingCost>;
}

@Injectable()
export class PaymentService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private shippingCalculator: ShippingCalculatorService,
    private emailService: EmailService,
    private events: MarketplaceEventsService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.warn('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(stripeSecretKey || 'sk_test_dummy', {
      apiVersion: '2026-01-28.clover',
    });
  }

  async createPaymentIntent(userId: string, dto: CreatePaymentIntentDto) {
    const { items, shippingSelections = [], shippingAddress } = dto;
    const now = new Date();

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
      include: {
        variants: true,
        vendor: { select: { isApproved: true, isSuspended: true } },
      },
    });
    const productsById = new Map(products.map((p) => [p.id, p]));

    const weightByVariantId = new Map<string, number>();
    const requiredStock = new Map<string, number>();
    const itemsByVendor: Record<string, CartItemDto[]> = {};

    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }

      if (
        !product.isActive ||
        !product.vendor.isApproved ||
        product.vendor.isSuspended
      ) {
        throw new BadRequestException(
          `"${product.name}" is not currently available`,
        );
      }

      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant || !variant.isActive) {
        throw new BadRequestException(
          `Variant ${item.variantId} not found for product ${item.productId}`,
        );
      }

      // Verify price matches what the storefront shows (incl. active discount)
      if (effectivePriceCents(product, variant, now) !== item.priceCents) {
        throw new BadRequestException(
          `Price mismatch for variant ${item.variantId}`,
        );
      }

      // Verify stock across every cart line for this product, not just this one
      const required =
        (requiredStock.get(product.id) ?? 0) + variant.unitAmount * item.quantity;
      requiredStock.set(product.id, required);
      if (required > product.stockAmount) {
        const maxQuantity = Math.floor(product.stockAmount / variant.unitAmount);
        throw new BadRequestException(
          `Insufficient stock for "${product.name}" (${variant.label}). Available: ${maxQuantity}, requested: ${item.quantity}`,
        );
      }

      weightByVariantId.set(variant.id, variant.weightGrams ?? 0);
      (itemsByVendor[product.vendorId] ??= []).push(item);
    }

    const vendorShipping = await this.priceShipping(
      itemsByVendor,
      shippingSelections,
      weightByVariantId,
      { requireActive: true },
    );

    const productSubtotalCents = items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );
    const totalShippingCents = Object.values(vendorShipping).reduce(
      (sum, s) => sum + s.cents,
      0,
    );
    const totalAmountCents = productSubtotalCents + totalShippingCents;

    if (totalAmountCents < 50) {
      throw new BadRequestException('Order total must be at least $0.50');
    }

    // Create Payment Intent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: 'aud',
      metadata: {
        userId,
        purpose: 'order',
        itemCount: items.length.toString(),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Persist the validated checkout so the order is created from it — by the
    // client callback or, if that never arrives, by the Stripe webhook.
    const payload: PendingOrderPayload = {
      items,
      shippingSelections,
      shippingAddress: shippingAddress ?? null,
      vendorShipping,
    };
    await this.prisma.pendingOrder.create({
      data: {
        paymentIntentId: paymentIntent.id,
        userId,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      totalAmountCents,
      productSubtotalCents,
      shippingCents: totalShippingCents,
    };
  }

  // Called from the Stripe webhook on payment_intent.succeeded — a fallback
  // path in case the client never calls createOrderFromPayment directly
  // (tab closed, network drop, etc). Idempotent with the client path via
  // Order.stripePaymentId's unique constraint.
  async reconcilePaymentIntent(paymentIntentId: string) {
    const existingOrder = await this.prisma.order.findUnique({
      where: { stripePaymentId: paymentIntentId },
      select: { id: true },
    });
    if (existingOrder) {
      return;
    }

    const pending = await this.prisma.pendingOrder.findUnique({
      where: { paymentIntentId },
    });
    if (!pending) {
      console.warn(
        `[Payment] No pending order found to reconcile for payment intent ${paymentIntentId}`,
      );
      return;
    }

    try {
      await this.createOrderFromPayment(pending.userId, paymentIntentId);
    } catch (error) {
      // Unlike the client-triggered path (which surfaces a "contact
      // support" message to a real person), this reconciliation path has no
      // human in the loop — if order creation still fails here (e.g. stock
      // sold out in the gap before the webhook fired), the customer must
      // not be left charged with nothing to show for it.
      console.error(
        `[Payment] Reconciliation failed for ${paymentIntentId}, issuing automatic refund:`,
        error,
      );
      let refunded = false;
      try {
        await this.stripe.refunds.create({ payment_intent: paymentIntentId });
        refunded = true;
      } catch (refundError) {
        console.error(
          `[Payment] CRITICAL: automatic refund also failed for ${paymentIntentId} — customer is charged with no order and no refund:`,
          refundError,
        );
      }
      await this.prisma.pendingOrder.deleteMany({ where: { paymentIntentId } });
      await this.events.reconciliationFailed(paymentIntentId, refunded, error);
    }
  }

  async createOrderFromPayment(userId: string, paymentIntentId: string) {
    const findOrder = () =>
      this.prisma.order.findUnique({
        where: { stripePaymentId: paymentIntentId },
        include: orderWithRelations,
      });

    // Idempotent: the client path and the webhook reconciliation path can
    // both reach here for the same payment intent — return the existing
    // order rather than erroring or double-creating.
    const existing = await findOrder();
    if (existing) {
      if (existing.userId !== userId) {
        throw new BadRequestException(
          'Payment intent does not belong to this user',
        );
      }
      return existing;
    }

    // Verify payment intent
    const paymentIntent =
      await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException('Payment not successful');
    }

    // Verify user owns this payment intent
    if (paymentIntent.metadata.userId !== userId) {
      throw new BadRequestException(
        'Payment intent does not belong to this user',
      );
    }

    // Only payments started through createPaymentIntent can become orders —
    // this rejects other succeeded PaymentIntents of the same user (e.g. a
    // paid promotion) that would otherwise pass the checks above.
    const pending = await this.prisma.pendingOrder.findUnique({
      where: { paymentIntentId },
    });
    if (!pending || pending.userId !== userId) {
      // The other creation path may have just finished and consumed it.
      const raced = await findOrder();
      if (raced && raced.userId === userId) {
        return raced;
      }
      throw new BadRequestException('No checkout found for this payment');
    }

    const payload = pending.payload as unknown as PendingOrderPayload;
    const items = payload.items;
    const shippingAddress = payload.shippingAddress ?? undefined;

    // Get commission rate
    const commissionConfig = await this.prisma.configuration.findUnique({
      where: { key: 'commission_rate' },
    });
    const parsedCommissionRate = commissionConfig
      ? parseFloat(commissionConfig.value)
      : NaN;
    const commissionRate = Number.isFinite(parsedCommissionRate)
      ? parsedCommissionRate
      : 0.1;

    // Prices were validated against the catalog when the checkout was
    // created and are what the customer was charged for.
    const productSubtotalCents = items.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );

    let order;
    try {
      // Create order in transaction
      order = await this.prisma.$transaction(async (tx) => {
        const variants = await tx.productVariant.findMany({
          where: { id: { in: items.map((i) => i.variantId) } },
          include: {
            product: { select: { id: true, name: true, vendorId: true } },
          },
        });
        const variantsById = new Map(variants.map((v) => [v.id, v]));

        const requiredStock = new Map<string, { amount: number; name: string }>();
        const weightByVariantId = new Map<string, number>();
        const itemsByVendor: Record<string, CartItemDto[]> = {};
        for (const item of items) {
          const variant = variantsById.get(item.variantId);
          if (!variant || variant.productId !== item.productId) {
            throw new BadRequestException(`Variant ${item.variantId} not found`);
          }
          const entry = requiredStock.get(variant.productId) ?? {
            amount: 0,
            name: variant.product.name,
          };
          entry.amount += variant.unitAmount * item.quantity;
          requiredStock.set(variant.productId, entry);
          weightByVariantId.set(variant.id, variant.weightGrams ?? 0);
          (itemsByVendor[variant.product.vendorId] ??= []).push(item);
        }

        // Deduct stock atomically. The conditional update re-checks stock
        // under the row lock, so two concurrent orders can never both take
        // the last units (a plain read-then-decrement could oversell).
        for (const [productId, { amount, name }] of requiredStock) {
          const { count } = await tx.product.updateMany({
            where: { id: productId, stockAmount: { gte: amount } },
            data: { stockAmount: { decrement: amount } },
          });
          if (count !== 1) {
            throw new BadRequestException(`Insufficient stock for "${name}"`);
          }
        }

        const vendorShippingCosts =
          payload.vendorShipping ??
          (await this.priceShipping(
            itemsByVendor,
            payload.shippingSelections ?? [],
            weightByVariantId,
            { requireActive: false },
          ));
        const totalShippingCents = Object.keys(itemsByVendor).reduce(
          (sum, vendorId) => sum + (vendorShippingCosts[vendorId]?.cents ?? 0),
          0,
        );

        const totalAmountCents = productSubtotalCents + totalShippingCents;

        // Defense in depth: the payment intent's captured amount is the
        // source of truth for what the customer actually paid.
        if (totalAmountCents !== paymentIntent.amount) {
          throw new BadRequestException(
            'Order total does not match the amount charged',
          );
        }

        // Create main order
        const newOrder = await tx.order.create({
          data: {
            userId,
            stripePaymentId: paymentIntentId,
            totalAmountCents,
            shippingCents: totalShippingCents,
            status: 'PAID',
            ...(shippingAddress && {
              shippingName: shippingAddress.name,
              shippingAddress: shippingAddress.address,
              shippingCity: shippingAddress.city,
              shippingState: shippingAddress.state,
              shippingZip: shippingAddress.zip,
              shippingPhone: shippingAddress.phone,
            }),
          },
        });

        // Create vendor orders
        for (const [vendorId, vendorItems] of Object.entries(itemsByVendor)) {
          const subtotalCents = vendorItems.reduce(
            (sum, item) => sum + item.priceCents * item.quantity,
            0,
          );
          const commissionCents = Math.round(subtotalCents * commissionRate);
          const vendorShipping = vendorShippingCosts[vendorId] || {
            cents: 0,
            method: null,
            optionId: null,
          };
          // Vendor payout = product subtotal - commission + shipping (vendor keeps shipping)
          const payoutCents =
            subtotalCents - commissionCents + vendorShipping.cents;

          const vendorOrder = await tx.vendorOrder.create({
            data: {
              orderId: newOrder.id,
              vendorId,
              subtotalCents,
              commissionCents,
              payoutCents,
              shippingCents: vendorShipping.cents,
              shippingMethod: vendorShipping.method,
              shippingOptionId: vendorShipping.optionId,
              status: 'PROCESSING',
            },
          });

          // Create order items
          for (const item of vendorItems) {
            await tx.orderItem.create({
              data: {
                vendorOrderId: vendorOrder.id,
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                priceCents: item.priceCents,
              },
            });
          }

          // Funds are not transferred here. payoutCents accumulates as the
          // vendor's claimable balance once this order is marked COMPLETED,
          // and is only ever moved via PayoutsService (vendor- or
          // admin-initiated, gated by the configured minimum payout amount).
        }

        return tx.order.findUnique({
          where: { id: newOrder.id },
          include: orderWithRelations,
        });
      });
    } catch (err) {
      // Two concurrent callers (e.g. the client's create-order call racing
      // the webhook) both found no existing order and both tried to create
      // one — the DB's unique constraint on stripePaymentId lets only one
      // win. Treat the loser as a normal idempotent hit.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await findOrder();
        if (winner && winner.userId === userId) {
          await this.prisma.pendingOrder.deleteMany({ where: { paymentIntentId } });
          return winner;
        }
      }
      throw err;
    }

    await this.prisma.pendingOrder.deleteMany({ where: { paymentIntentId } });

    if (order) {
      await this.events.orderCreated(order);
      await this.sendOrderEmails(order);
    }

    return order;
  }

  // Prices shipping per vendor. Every vendor in the cart needs exactly one
  // selection, and selections for vendors not in the cart are rejected —
  // otherwise shipping could be skipped (free) or charged for nothing.
  private async priceShipping(
    itemsByVendor: Record<string, CartItemDto[]>,
    selections: VendorShippingSelectionDto[],
    weightByVariantId: Map<string, number>,
    opts: { requireActive: boolean },
  ): Promise<Record<string, VendorShippingCost>> {
    const selectionByVendor = new Map<string, VendorShippingSelectionDto>();
    for (const sel of selections) {
      if (!itemsByVendor[sel.vendorId]) {
        throw new BadRequestException(
          `Shipping was selected for vendor ${sel.vendorId}, which has no items in this order`,
        );
      }
      if (selectionByVendor.has(sel.vendorId)) {
        throw new BadRequestException(
          `Only one shipping option can be selected for vendor ${sel.vendorId}`,
        );
      }
      selectionByVendor.set(sel.vendorId, sel);
    }

    const costs: Record<string, VendorShippingCost> = {};
    for (const [vendorId, vendorItems] of Object.entries(itemsByVendor)) {
      const sel = selectionByVendor.get(vendorId);
      if (!sel) {
        throw new BadRequestException(
          'Please choose a shipping option for every store in your cart',
        );
      }

      const option = await this.prisma.vendorShippingOption.findUnique({
        where: { id: sel.shippingOptionId },
        include: { weightTiers: true },
      });
      if (
        !option ||
        option.vendorId !== vendorId ||
        (opts.requireActive && !option.isActive)
      ) {
        throw new BadRequestException(
          `Invalid shipping option for vendor ${vendorId}`,
        );
      }

      const { costCents } =
        await this.shippingCalculator.calculateVendorShippingCents(
          option,
          vendorItems,
          { precomputedWeights: weightByVariantId },
        );
      costs[vendorId] = {
        cents: costCents,
        method: option.name,
        optionId: option.id,
      };
    }
    return costs;
  }

  private async sendOrderEmails(
    order: NonNullable<
      Awaited<ReturnType<PaymentService['createOrderFromPayment']>>
    >,
  ) {
    try {
      await this.emailService.sendOrderConfirmation({
        customerEmail: order.user.email,
        customerName: order.user.name || 'there',
        orderId: order.id,
        totalAmountCents: order.totalAmountCents,
        items: order.vendorOrders.flatMap((vo) => vo.items),
      });
    } catch (error) {
      console.error('Failed to send order confirmation email:', error);
    }

    for (const vendorOrder of order.vendorOrders) {
      try {
        await this.emailService.sendVendorNewOrder({
          vendorEmail: vendorOrder.vendor.user.email,
          vendorName: vendorOrder.vendor.storeName,
          vendorOrderId: vendorOrder.id,
          subtotalCents: vendorOrder.subtotalCents,
          items: vendorOrder.items,
        });
      } catch (error) {
        console.error('Failed to send vendor new-order email:', error);
      }
    }
  }
}
