import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PromotionType } from '@prisma/client';
import Stripe from 'stripe';
import { CreatePromotionIntentDto } from './dto/create-promotion-intent.dto';
import { MarketplaceEventsService } from '../notifications/marketplace-events.service';

const DEFAULT_PRICE_CENTS = 2000; // $20 AUD
const DEFAULT_DURATION_DAYS = 7;

@Injectable()
export class PromotionsService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
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

  async createIntent(userId: string, dto: CreatePromotionIntentDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    // Featured listings only render for approved, active stores — don't take
    // payment for a promotion that could never be shown.
    if (!vendor.isApproved || vendor.isSuspended) {
      throw new BadRequestException(
        'Your store must be approved and active before you can buy a promotion',
      );
    }

    let productId: string | null = null;
    if (dto.type === PromotionType.FEATURED_PRODUCT) {
      if (!dto.productId) {
        throw new BadRequestException(
          'productId is required to feature a product',
        );
      }
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product || product.vendorId !== vendor.id) {
        throw new BadRequestException(
          'Product not found or does not belong to you',
        );
      }
      if (!product.isActive) {
        throw new BadRequestException(
          'Publish this product before featuring it',
        );
      }
      productId = product.id;
    }

    const priceCents = await this.getPriceCents();

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: priceCents,
      currency: 'aud',
      metadata: {
        userId,
        vendorId: vendor.id,
        promotionType: dto.type,
        productId: productId || '',
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      priceCents,
    };
  }

  async confirmPromotion(userId: string, paymentIntentId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    // Idempotent: confirming twice (double-click, retry) just returns the
    // already-created promotion instead of erroring or double-charging logic.
    const existing = await this.prisma.promotion.findUnique({
      where: { stripePaymentId: paymentIntentId },
    });
    if (existing) {
      if (existing.vendorId !== vendor.id) {
        throw new BadRequestException(
          'Payment intent does not belong to this vendor',
        );
      }
      return existing;
    }

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException('Payment not successful');
    }
    if (paymentIntent.metadata.vendorId !== vendor.id) {
      throw new BadRequestException(
        'Payment intent does not belong to this vendor',
      );
    }

    const type = paymentIntent.metadata.promotionType as PromotionType;
    if (!Object.values(PromotionType).includes(type)) {
      throw new BadRequestException('Payment intent is not a promotion payment');
    }
    const productId = paymentIntent.metadata.productId || null;
    const durationDays = await this.getDurationDays();
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    try {
      const promotion = await this.prisma.promotion.create({
        data: {
          vendorId: vendor.id,
          ...(productId && { productId }),
          type,
          status: 'ACTIVE',
          startDate,
          endDate,
          priceCents: paymentIntent.amount,
          stripePaymentId: paymentIntentId,
        },
      });
      await this.events.promotionActivated(promotion);
      return promotion;
    } catch (err) {
      // A concurrent confirm for the same payment won the unique constraint
      // on stripePaymentId — return its promotion instead of a duplicate.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.promotion.findUniqueOrThrow({
          where: { stripePaymentId: paymentIntentId },
        });
      }
      throw err;
    }
  }

  async getMyPromotions(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    return this.prisma.promotion.findMany({
      where: { vendorId: vendor.id },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFeaturedProducts() {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        type: PromotionType.FEATURED_PRODUCT,
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        product: { isActive: true, vendor: { isApproved: true, isSuspended: false } },
      },
      include: {
        product: {
          include: {
            images: true,
            category: true,
            variants: true,
            vendor: { select: { id: true, storeName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Set<string>();
    const products: NonNullable<(typeof promotions)[number]['product']>[] = [];
    for (const promo of promotions) {
      if (!promo.product || seen.has(promo.product.id)) continue;
      seen.add(promo.product.id);
      products.push(promo.product);
    }
    return products;
  }

  async getFeaturedVendors() {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        type: PromotionType.FEATURED_VENDOR,
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        vendor: { isApproved: true, isSuspended: false },
      },
      include: {
        vendor: { include: { _count: { select: { products: true, reviews: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Set<string>();
    const vendors: (typeof promotions)[number]['vendor'][] = [];
    for (const promo of promotions) {
      if (seen.has(promo.vendor.id)) continue;
      seen.add(promo.vendor.id);
      vendors.push(promo.vendor);
    }
    return vendors;
  }

  async getAllPromotions() {
    return this.prisma.promotion.findMany({
      include: {
        vendor: { select: { id: true, storeName: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getPriceCents(): Promise<number> {
    const config = await this.prisma.configuration.findUnique({
      where: { key: 'featured_listing_price_cents' },
    });
    const parsed = config ? parseInt(config.value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_PRICE_CENTS;
  }

  private async getDurationDays(): Promise<number> {
    const config = await this.prisma.configuration.findUnique({
      where: { key: 'featured_listing_duration_days' },
    });
    const parsed = config ? parseInt(config.value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_DURATION_DAYS;
  }
}
