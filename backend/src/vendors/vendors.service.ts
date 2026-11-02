import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import {
  CreateShippingOptionDto,
  CreateWeightTierDto,
  UpdateShippingOptionDto,
} from './dto/vendor-shipping.dto';
import { ShippingQuoteItemDto } from './dto/shipping-quote.dto';
import { ShippingCalculatorService } from './shipping-calculator.service';
import { ShippingMethodType } from '@prisma/client';
import { effectivePriceCents } from '../products/product-pricing';
import { MarketplaceEventsService } from '../notifications/marketplace-events.service';

@Injectable()
export class VendorsService {
  constructor(
    private prisma: PrismaService,
    private shippingCalculator: ShippingCalculatorService,
    private events: MarketplaceEventsService,
  ) {}

  async create(userId: string, createVendorDto: CreateVendorDto) {
    const existingVendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (existingVendor) {
      throw new BadRequestException('User is already a vendor');
    }

    const { storeName, description } = createVendorDto;

    // Create the vendor profile
    const vendor = await this.prisma.vendor.create({
      data: {
        userId,
        storeName,
        description,
      },
      include: {
        stripeAccount: true,
      },
    });

    // TODO: Create Stripe Connect account here later
    // await this.createStripeAccount(vendor.id);

    // Update user role to VENDOR
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'VENDOR' },
    });

    await this.events.vendorApplied(vendor);
    return vendor;
  }

  // Public listing counts only products a customer can actually see.
  private readonly publicCounts = {
    _count: {
      select: { products: { where: { isActive: true } }, reviews: true },
    },
  } as const;

  async findAll() {
    return this.prisma.vendor.findMany({
      where: { isApproved: true, isSuspended: false },
      include: this.publicCounts,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    // Pending, rejected and suspended stores are not public.
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, isApproved: true, isSuspended: false },
      include: {
        ...this.publicCounts,
        products: {
          where: { isActive: true },
          include: {
            images: true,
            category: true,
            variants: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async findByUser(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      include: {
        _count: { select: { products: true, orders: true } },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return vendor;
  }

  async update(userId: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return this.prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        ...(dto.storeName !== undefined && { storeName: dto.storeName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.photo !== undefined && { photo: dto.photo }),
        ...(dto.coverPhoto !== undefined && { coverPhoto: dto.coverPhoto }),
        ...(dto.location !== undefined && { location: dto.location || null }),
        ...(dto.state !== undefined && { state: dto.state || null }),
        ...(dto.phone !== undefined && { phone: dto.phone || null }),
      },
    });
  }

  // --- Shipping Options ---

  private readonly shippingOptionInclude = {
    weightTiers: { orderBy: { minGrams: 'asc' as const } },
  };

  private validateWeightTiers(tiers?: CreateWeightTierDto[]) {
    if (!tiers || tiers.length === 0) {
      throw new BadRequestException(
        'At least one weight tier is required for weight-based shipping',
      );
    }

    let previousMaxGrams = 0;
    tiers.forEach((tier, index) => {
      const isLast = index === tiers.length - 1;

      if (tier.priceCents < 0) {
        throw new BadRequestException('Weight tier price cannot be negative');
      }

      if (!isLast && tier.maxGrams == null) {
        throw new BadRequestException(
          'Only the last weight tier may be left open-ended',
        );
      }

      if (tier.maxGrams != null && tier.maxGrams <= previousMaxGrams) {
        throw new BadRequestException(
          'Weight tiers must be in strictly increasing order',
        );
      }

      if (tier.maxGrams != null) {
        previousMaxGrams = tier.maxGrams;
      }
    });
  }

  private buildWeightTiersCreateData(tiers: CreateWeightTierDto[]) {
    return tiers.map((tier, index) => ({
      minGrams: index === 0 ? 0 : (tiers[index - 1].maxGrams ?? 0),
      maxGrams: tier.maxGrams ?? null,
      priceCents: tier.priceCents,
    }));
  }

  async getShippingOptions(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    return this.prisma.vendorShippingOption.findMany({
      where: { vendorId: vendor.id },
      include: this.shippingOptionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVendorShippingOptionsPublic(vendorId: string) {
    return this.prisma.vendorShippingOption.findMany({
      where: { vendorId, isActive: true },
      include: this.shippingOptionInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createShippingOption(userId: string, dto: CreateShippingOptionDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (dto.type === ShippingMethodType.WEIGHT_BASED) {
      this.validateWeightTiers(dto.weightTiers);
    }

    return this.prisma.vendorShippingOption.create({
      data: {
        vendorId: vendor.id,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        flatRateCents:
          dto.type === ShippingMethodType.FLAT_RATE ? dto.flatRateCents : null,
        minOrderCents: dto.minOrderCents,
        estimatedDays: dto.estimatedDays,
        ...(dto.type === ShippingMethodType.WEIGHT_BASED && {
          weightTiers: {
            create: this.buildWeightTiersCreateData(dto.weightTiers!),
          },
        }),
      },
      include: this.shippingOptionInclude,
    });
  }

  async updateShippingOption(
    userId: string,
    optionId: string,
    dto: UpdateShippingOptionDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const option = await this.prisma.vendorShippingOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.vendorId !== vendor.id) {
      throw new NotFoundException('Shipping option not found');
    }

    const nextType = dto.type ?? option.type;

    if (nextType === ShippingMethodType.WEIGHT_BASED && dto.weightTiers) {
      this.validateWeightTiers(dto.weightTiers);
    }

    return this.prisma.$transaction(async (tx) => {
      if (nextType !== ShippingMethodType.WEIGHT_BASED) {
        await tx.shippingWeightTier.deleteMany({
          where: { shippingOptionId: optionId },
        });
      } else if (dto.weightTiers) {
        await tx.shippingWeightTier.deleteMany({
          where: { shippingOptionId: optionId },
        });
        await tx.shippingWeightTier.createMany({
          data: this.buildWeightTiersCreateData(dto.weightTiers).map(
            (tier) => ({ ...tier, shippingOptionId: optionId }),
          ),
        });
      }

      return tx.vendorShippingOption.update({
        where: { id: optionId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.type !== undefined && {
            flatRateCents:
              dto.type === ShippingMethodType.FLAT_RATE
                ? (dto.flatRateCents ?? option.flatRateCents)
                : null,
          }),
          ...(dto.type === undefined &&
            dto.flatRateCents !== undefined && {
              flatRateCents: dto.flatRateCents,
            }),
          ...(dto.minOrderCents !== undefined && {
            minOrderCents: dto.minOrderCents,
          }),
          ...(dto.estimatedDays !== undefined && {
            estimatedDays: dto.estimatedDays,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: this.shippingOptionInclude,
      });
    });
  }

  async deleteShippingOption(userId: string, optionId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const option = await this.prisma.vendorShippingOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.vendorId !== vendor.id) {
      throw new NotFoundException('Shipping option not found');
    }

    return this.prisma.vendorShippingOption.delete({
      where: { id: optionId },
    });
  }

  async getShippingQuote(vendorId: string, items: ShippingQuoteItemDto[]) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const weightByVariantId = new Map<string, number>();
    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { variants: true },
      });
      if (!product || product.vendorId !== vendorId) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) {
        throw new BadRequestException(
          `Variant ${item.variantId} not found for product ${item.productId}`,
        );
      }
      if (effectivePriceCents(product, variant) !== item.priceCents) {
        throw new BadRequestException(
          `Price mismatch for variant ${item.variantId}`,
        );
      }
      weightByVariantId.set(item.variantId, variant.weightGrams ?? 0);
    }

    const options = await this.prisma.vendorShippingOption.findMany({
      where: { vendorId, isActive: true },
      include: this.shippingOptionInclude,
      orderBy: { createdAt: 'asc' },
    });

    const quotes = [];
    for (const option of options) {
      try {
        const result =
          await this.shippingCalculator.calculateVendorShippingCents(
            option,
            items,
            { precomputedWeights: weightByVariantId },
          );
        quotes.push({
          id: option.id,
          name: option.name,
          description: option.description,
          type: option.type,
          estimatedDays: option.estimatedDays,
          minOrderCents: option.minOrderCents,
          flatRateCents: option.flatRateCents,
          costCents: result.costCents,
          isFree: result.isFree,
          available: true,
          matchedTier: result.matchedTier ?? null,
        });
      } catch (err) {
        quotes.push({
          id: option.id,
          name: option.name,
          description: option.description,
          type: option.type,
          estimatedDays: option.estimatedDays,
          minOrderCents: option.minOrderCents,
          flatRateCents: option.flatRateCents,
          costCents: null,
          isFree: false,
          available: false,
          unavailableReason:
            err instanceof BadRequestException
              ? err.message
              : 'This shipping option is unavailable for your cart',
        });
      }
    }

    return quotes;
  }
}
