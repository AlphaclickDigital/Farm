import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ShippingMethodType,
  VendorShippingOption,
  ShippingWeightTier,
} from '@prisma/client';

export interface ShippingQuoteItem {
  productId: string;
  variantId: string;
  quantity: number;
  priceCents: number;
}

export type ShippingOptionWithTiers = VendorShippingOption & {
  weightTiers: ShippingWeightTier[];
};

export interface ShippingCostResult {
  costCents: number;
  isFree: boolean;
  matchedTier?: { minGrams: number; maxGrams: number | null } | null;
}

@Injectable()
export class ShippingCalculatorService {
  constructor(private prisma: PrismaService) {}

  async calculateVendorShippingCents(
    option: ShippingOptionWithTiers,
    vendorItems: ShippingQuoteItem[],
    opts?: { precomputedWeights?: Map<string, number> },
  ): Promise<ShippingCostResult> {
    const vendorSubtotalCents = vendorItems.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );

    if (
      option.type !== ShippingMethodType.PICKUP &&
      option.minOrderCents != null &&
      vendorSubtotalCents >= option.minOrderCents
    ) {
      return { costCents: 0, isFree: true };
    }

    switch (option.type) {
      case ShippingMethodType.PICKUP:
        return { costCents: 0, isFree: true };

      case ShippingMethodType.FLAT_RATE:
        return { costCents: option.flatRateCents ?? 0, isFree: false };

      case ShippingMethodType.WEIGHT_BASED: {
        const totalGrams = await this.totalWeightGrams(
          vendorItems,
          opts?.precomputedWeights,
        );
        const tier = this.findMatchingTier(option.weightTiers, totalGrams);
        if (!tier) {
          throw new BadRequestException(
            'No shipping rate configured for this weight — contact the vendor',
          );
        }
        return {
          costCents: tier.priceCents,
          isFree: tier.priceCents === 0,
          matchedTier: { minGrams: tier.minGrams, maxGrams: tier.maxGrams },
        };
      }
    }
  }

  private findMatchingTier(
    tiers: ShippingWeightTier[],
    totalGrams: number,
  ): ShippingWeightTier | null {
    // [minGrams, maxGrams) half-open interval convention; null maxGrams = unbounded top tier
    return (
      [...tiers]
        .sort((a, b) => a.minGrams - b.minGrams)
        .find(
          (t) =>
            totalGrams >= t.minGrams &&
            (t.maxGrams == null || totalGrams < t.maxGrams),
        ) ?? null
    );
  }

  private async totalWeightGrams(
    items: ShippingQuoteItem[],
    precomputed?: Map<string, number>,
  ): Promise<number> {
    let total = 0;
    for (const item of items) {
      let weight = precomputed?.get(item.variantId);
      if (weight === undefined) {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: item.variantId },
          select: { weightGrams: true },
        });
        weight = variant?.weightGrams ?? 0;
      }
      total += weight * item.quantity;
    }
    return total;
  }
}
