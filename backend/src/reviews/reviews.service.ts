import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';
import { MarketplaceEventsService } from '../notifications/marketplace-events.service';

export const VENDOR_REVIEW_FILTERS = ['all', 'unanswered', 'positive', 'critical'] as const;
export type VendorReviewFilter = (typeof VENDOR_REVIEW_FILTERS)[number];

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private events: MarketplaceEventsService,
  ) {}

  // Upsert: a customer can only leave one review per product, but may edit it.
  async createOrUpdateReview(userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, vendorId: true, name: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const purchased = await this.prisma.orderItem.findFirst({
      where: {
        productId: dto.productId,
        vendorOrder: { status: 'COMPLETED', order: { userId } },
      },
    });
    if (!purchased) {
      throw new BadRequestException(
        'You can only review products from orders that have been completed',
      );
    }

    const existing = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId: dto.productId } },
      select: { id: true },
    });
    const review = await this.prisma.review.upsert({
      where: { userId_productId: { userId, productId: dto.productId } },
      update: { rating: dto.rating, comment: dto.comment },
      create: {
        userId,
        productId: dto.productId,
        vendorId: product.vendorId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
    // Only brand-new reviews notify the vendor; edits just refresh analytics.
    if (!existing) {
      await this.events.reviewCreated({
        vendorId: product.vendorId,
        rating: dto.rating,
        productName: product.name,
      });
    } else {
      this.events.productChanged(product.vendorId);
    }
    return review;
  }

  // ───── Vendor review management ─────

  async getVendorReviewList(
    userId: string,
    opts: { filter: VendorReviewFilter; q?: string; page: number; pageSize: number },
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const where: Prisma.ReviewWhereInput = {
      vendorId: vendor.id,
      ...(opts.filter === 'unanswered' && { vendorReply: null }),
      ...(opts.filter === 'positive' && { rating: { gte: 4 } }),
      ...(opts.filter === 'critical' && { rating: { lte: 2 } }),
      ...(opts.q && {
        OR: [
          { comment: { contains: opts.q, mode: 'insensitive' } },
          { product: { name: { contains: opts.q, mode: 'insensitive' } } },
          { user: { name: { contains: opts.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [total, data] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: {
          user: { select: { name: true } },
          product: { select: { id: true, name: true, images: { select: { url: true }, take: 1 } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
    ]);
    return { total, page: opts.page, pageSize: opts.pageSize, data };
  }

  // A blank reply removes the existing one.
  async replyToReview(userId: string, reviewId: string, reply: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { vendorId: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.vendorId !== vendor.id) {
      throw new ForbiddenException('You can only reply to reviews of your own products');
    }

    const text = reply.trim();
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: text
        ? { vendorReply: text, vendorRepliedAt: new Date() }
        : { vendorReply: null, vendorRepliedAt: null },
    });
    this.events.productChanged(vendor.id);
    return updated;
  }

  async getProductReviews(productId: string) {
    const [reviews, summary] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      reviews,
      average: summary._avg.rating || 0,
      count: summary._count,
    };
  }

  async getVendorReviews(vendorId: string) {
    const [reviews, summary] = await Promise.all([
      this.prisma.review.findMany({
        where: { vendorId },
        include: {
          user: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.aggregate({
        where: { vendorId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      reviews,
      average: summary._avg.rating || 0,
      count: summary._count,
    };
  }

  // Lets the frontend know which products the current user has already
  // reviewed, to power "write a review" vs "edit your review" on order pages.
  async getMyReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { userId },
      select: { id: true, productId: true, rating: true, comment: true },
    });
  }

  async deleteReview(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You do not have access to this review');
    }

    return this.prisma.review.delete({ where: { id: reviewId } });
  }
}
