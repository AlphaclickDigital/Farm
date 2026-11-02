import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MarketplaceEventsService } from '../notifications/marketplace-events.service';

const productIncludes = {
  images: true,
  category: true,
  variants: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private events: MarketplaceEventsService,
  ) {}

  private async generateUniqueSlug(
    vendorId: string,
    name: string,
    excludeProductId?: string,
  ): Promise<string> {
    const baseSlug =
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'product';

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.product.findFirst({
        where: {
          vendorId,
          slug,
          ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
        },
      });
      if (!existing) return slug;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }

  async createForVendor(userId: string, dto: CreateProductDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new BadRequestException(
        'You must be a registered vendor to create products',
      );
    }

    await this.assertCategoryExists(dto.categoryId);

    const slug = await this.generateUniqueSlug(vendor.id, dto.name);

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        baseUnit: dto.baseUnit,
        stockAmount: dto.stockAmount,
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
        discountName: dto.discountName,
        discountCents: dto.discountCents,
        discountEndsAt: dto.discountEndsAt
          ? new Date(dto.discountEndsAt)
          : undefined,
        vendor: { connect: { id: vendor.id } },
        category: { connect: { id: dto.categoryId } },
        variants: {
          create: dto.variants.map((v) => ({
            label: v.label,
            unitAmount: v.unitAmount,
            priceCents: v.priceCents,
            weightGrams: v.weightGrams,
          })),
        },
        images: dto.imageUrls?.length
          ? {
              create: dto.imageUrls.map((url) => ({ url })),
            }
          : undefined,
      },
      include: { ...productIncludes, vendor: true },
    });

    this.events.productChanged(vendor.id);
    return product;
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.ProductWhereUniqueInput;
    where?: Prisma.ProductWhereInput;
    orderBy?: Prisma.ProductOrderByWithRelationInput;
  }) {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.product.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: productIncludes,
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { ...productIncludes, vendor: true },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  async updateForVendor(
    userId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new BadRequestException('You must be a registered vendor');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.vendorId !== vendor.id) {
      throw new ForbiddenException('You can only edit your own products');
    }

    // Variant ids are client-supplied: without this check a vendor could
    // rewrite another vendor's variant (price, label) through their own product.
    if (dto.variants) {
      const ownVariantIds = new Set(product.variants.map((v) => v.id));
      const foreign = dto.variants.find((v) => v.id && !ownVariantIds.has(v.id));
      if (foreign) {
        throw new BadRequestException(
          `Variant ${foreign.id} does not belong to this product`,
        );
      }
    }

    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Handle variant upsert/delete if provided
      if (dto.variants) {
        const incomingIds = dto.variants
          .filter((v) => v.id)
          .map((v) => v.id as string);

        // Delete variants that are no longer in the list
        await tx.productVariant.deleteMany({
          where: {
            productId,
            id: { notIn: incomingIds },
          },
        });

        // Upsert each variant
        for (const v of dto.variants) {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                label: v.label,
                unitAmount: v.unitAmount,
                priceCents: v.priceCents,
                weightGrams: v.weightGrams,
              },
            });
          } else {
            await tx.productVariant.create({
              data: {
                productId,
                label: v.label,
                unitAmount: v.unitAmount,
                priceCents: v.priceCents,
                weightGrams: v.weightGrams,
              },
            });
          }
        }
      }

      // Handle image replacement if provided
      if (dto.imageUrls) {
        await tx.productImage.deleteMany({ where: { productId } });
        if (dto.imageUrls.length > 0) {
          await tx.productImage.createMany({
            data: dto.imageUrls.map((url) => ({ productId, url })),
          });
        }
      }

      // Regenerate slug if name changed
      const newSlug =
        dto.name !== undefined && dto.name !== product.name
          ? await this.generateUniqueSlug(vendor.id, dto.name, productId)
          : undefined;

      // Update the product fields
      return tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(newSlug !== undefined && { slug: newSlug }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.baseUnit !== undefined && { baseUnit: dto.baseUnit }),
          ...(dto.stockAmount !== undefined && {
            stockAmount: dto.stockAmount,
          }),
          ...(dto.categoryId !== undefined && {
            category: { connect: { id: dto.categoryId } },
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.discountName !== undefined && {
            discountName: dto.discountName,
          }),
          ...(dto.discountCents !== undefined && {
            discountCents: dto.discountCents,
          }),
          ...(dto.discountEndsAt !== undefined && {
            discountEndsAt: dto.discountEndsAt
              ? new Date(dto.discountEndsAt)
              : null,
          }),
        },
        include: { ...productIncludes, vendor: true },
      });
    });
    this.events.productChanged(vendor.id);
    return updated;
  }

  async removeForVendor(userId: string, productId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { _count: { select: { orderItems: true, promotions: true } } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
    if (!vendor || product.vendorId !== vendor.id) {
      throw new ForbiddenException('You can only delete your own products');
    }
    // Order history and paid promotions reference the product; deleting it
    // would either fail or erase records customers and admins rely on.
    if (product._count.orderItems > 0 || product._count.promotions > 0) {
      throw new BadRequestException(
        'This product has order or promotion history and cannot be deleted. Unpublish it instead.',
      );
    }

    const removed = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId } });
      return tx.product.delete({ where: { id: productId } });
    });
    this.events.productChanged(vendor.id);
    return removed;
  }

  async findByVendor(vendorId: string) {
    return this.prisma.product.findMany({
      where: { vendorId },
      include: productIncludes,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      return [];
    }

    return this.findByVendor(vendor.id);
  }
}
