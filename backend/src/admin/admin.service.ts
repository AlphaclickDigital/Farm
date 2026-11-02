import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UpdateConfigurationDto } from './dto/update-configuration.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AdminUpdateVendorDto } from './dto/admin-update-vendor.dto';
import { UpdatePromotionStatusDto } from './dto/update-promotion-status.dto';
import { ActivityAction, ActivityActor, ActivityLogService } from '../activity/activity-log.service';
import { NotificationType, NotificationsService } from '../notifications/notifications.service';
import { AnalyticsCacheService } from '../analytics/cache/analytics-cache.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private activity: ActivityLogService,
    private notifications: NotificationsService,
    private analyticsCache: AnalyticsCacheService,
  ) {}

  // ───── Vendor Management ─────

  async getPendingVendors() {
    return this.prisma.vendor.findMany({
      where: { isApproved: false },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { products: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllVendors() {
    return this.prisma.vendor.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { products: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVendorById(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        _count: { select: { products: true, orders: true, reviews: true } },
        stripeAccount: {
          select: {
            chargesEnabled: true,
            payoutsEnabled: true,
            onboardingComplete: true,
          },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async approveVendor(vendorId: string, actor?: ActivityActor) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { user: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { isApproved: true },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    try {
      await this.emailService.sendVendorApproval({
        email: vendor.user.email,
        name: vendor.user.name || 'there',
        storeName: vendor.storeName,
      });
    } catch (error) {
      console.error('Failed to send vendor approval email:', error);
    }

    this.analyticsCache.invalidateVendor(vendorId);
    await this.activity.record(actor ?? null, {
      action: ActivityAction.VENDOR_APPROVED,
      summary: `Approved ${vendor.storeName}`,
      entityType: 'Vendor',
      entityId: vendorId,
    });
    await this.notifications.notifyVendor(vendorId, {
      type: NotificationType.VENDOR_APPROVED,
      severity: 'success',
      title: 'Your store has been approved',
      body: 'Your products are now visible to customers.',
      link: '/vendor/dashboard',
    });

    return updated;
  }

  async rejectVendor(vendorId: string, actor?: ActivityActor) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { user: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { isApproved: false },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    try {
      await this.emailService.sendVendorRejection({
        email: vendor.user.email,
        name: vendor.user.name || 'there',
        storeName: vendor.storeName,
      });
    } catch (error) {
      console.error('Failed to send vendor rejection email:', error);
    }

    this.analyticsCache.invalidateVendor(vendorId);
    await this.activity.record(actor ?? null, {
      action: ActivityAction.VENDOR_REJECTED,
      summary: `Rejected ${vendor.storeName}`,
      entityType: 'Vendor',
      entityId: vendorId,
    });
    await this.notifications.notifyVendor(vendorId, {
      type: NotificationType.VENDOR_REJECTED,
      severity: 'warning',
      title: 'Your store application was not approved',
      body: 'Check your email for details, then update your store profile or contact support.',
      link: '/vendor/dashboard/settings',
    });

    return updated;
  }

  async adminUpdateVendor(vendorId: string, dto: AdminUpdateVendorDto, actor?: ActivityActor) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (dto.isSuspended === true && !dto.suspendedReason) {
      throw new BadRequestException(
        'Suspension reason is required when suspending a vendor',
      );
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.isSuspended === false) {
      data.suspendedReason = null;
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    this.analyticsCache.invalidateVendor(vendorId);
    await this.activity.record(actor ?? null, {
      action: ActivityAction.VENDOR_UPDATED,
      summary: `Updated ${updated.storeName} (${Object.keys(dto).join(', ')})`,
      entityType: 'Vendor',
      entityId: vendorId,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async suspendVendor(vendorId: string, reason: string, actor?: ActivityActor) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { isSuspended: true, suspendedReason: reason },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    this.analyticsCache.invalidateVendor(vendorId);
    await this.activity.record(actor ?? null, {
      action: ActivityAction.VENDOR_SUSPENDED,
      summary: `Suspended ${vendor.storeName}${reason ? `: ${reason}` : ''}`,
      entityType: 'Vendor',
      entityId: vendorId,
    });
    await this.notifications.notifyVendor(vendorId, {
      type: NotificationType.VENDOR_SUSPENDED,
      severity: 'critical',
      title: 'Your store has been suspended',
      body: reason || 'Contact support for details.',
    });
    return updated;
  }

  async unsuspendVendor(vendorId: string, actor?: ActivityActor) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { isSuspended: false, suspendedReason: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    this.analyticsCache.invalidateVendor(vendorId);
    await this.activity.record(actor ?? null, {
      action: ActivityAction.VENDOR_UNSUSPENDED,
      summary: `Reinstated ${vendor.storeName}`,
      entityType: 'Vendor',
      entityId: vendorId,
    });
    return updated;
  }

  // ───── Category Management ─────

  async getAllCategories() {
    return this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto, actor?: ActivityActor) {
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(
        `Category with slug "${dto.slug}" already exists`,
      );
    }

    const category = await this.prisma.category.create({ data: dto });
    await this.activity.record(actor ?? null, {
      action: ActivityAction.CATEGORY_CREATED,
      summary: `Created category ${category.name}`,
      entityType: 'Category',
      entityId: category.id,
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actor?: ActivityActor) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.slug) {
      const existing = await this.prisma.category.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(
          `Category with slug "${dto.slug}" already exists`,
        );
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: { ...dto },
    });
    await this.activity.record(actor ?? null, {
      action: ActivityAction.CATEGORY_UPDATED,
      summary: `Updated category ${updated.name}`,
      entityType: 'Category',
      entityId: id,
    });
    return updated;
  }

  async deleteCategory(id: string, actor?: ActivityActor) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.products > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${category._count.products} products. Reassign products first.`,
      );
    }

    const deleted = await this.prisma.category.delete({ where: { id } });
    await this.activity.record(actor ?? null, {
      action: ActivityAction.CATEGORY_DELETED,
      summary: `Deleted category ${category.name}`,
      entityType: 'Category',
      entityId: id,
    });
    return deleted;
  }

  // ───── Platform Statistics ─────

  async getPlatformStats() {
    const [
      totalUsers,
      totalVendors,
      approvedVendors,
      pendingVendors,
      totalProducts,
      activeProducts,
      totalOrders,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vendor.count(),
      this.prisma.vendor.count({ where: { isApproved: true } }),
      this.prisma.vendor.count({ where: { isApproved: false } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { totalAmountCents: true },
      }),
    ]);

    const totalCommission = await this.prisma.vendorOrder.aggregate({
      _sum: { commissionCents: true },
    });

    return {
      users: {
        total: totalUsers,
      },
      vendors: {
        total: totalVendors,
        approved: approvedVendors,
        pending: pendingVendors,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
      },
      orders: {
        total: totalOrders,
        revenue: totalRevenue._sum.totalAmountCents || 0,
        commission: totalCommission._sum.commissionCents || 0,
      },
    };
  }

  // ───── User Management ─────

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            storeName: true,
            isApproved: true,
          },
        },
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ───── Order Management ─────

  async getAllOrders() {
    return this.prisma.order.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        vendorOrders: {
          include: {
            vendor: { select: { id: true, storeName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ───── Configuration Management ─────

  async getConfiguration() {
    return this.prisma.configuration.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async updateConfiguration(key: string, dto: UpdateConfigurationDto, actor?: ActivityActor) {
    const previous = await this.prisma.configuration.findUnique({ where: { key } });
    const updated = await this.prisma.configuration.upsert({
      where: { key },
      update: {
        value: dto.value,
        ...(dto.description && { description: dto.description }),
      },
      create: {
        key,
        value: dto.value,
        description: dto.description ?? null,
      },
    });
    this.analyticsCache.invalidateAdmin();
    await this.activity.record(actor ?? null, {
      action: ActivityAction.CONFIG_UPDATED,
      summary: `Changed ${key} from ${previous?.value ?? '(unset)'} to ${dto.value}`,
      entityType: 'Configuration',
      entityId: key,
      metadata: { key, from: previous?.value ?? null, to: dto.value },
    });
    return updated;
  }

  // ───── Promotion moderation ─────

  // Deactivating hides a featured listing immediately. It does not refund
  // the vendor; any refund stays a deliberate manual decision in Stripe.
  async updatePromotionStatus(id: string, dto: UpdatePromotionStatusDto, actor?: ActivityActor) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: { vendor: { select: { storeName: true } }, product: { select: { name: true } } },
    });
    if (!promotion) throw new NotFoundException('Promotion not found');
    if (promotion.status === dto.status) return promotion;
    if (promotion.status === 'EXPIRED') {
      throw new BadRequestException('Expired promotions cannot be changed');
    }
    if (dto.status === 'ACTIVE' && promotion.endDate < new Date()) {
      throw new BadRequestException('This promotion has already ended and cannot be reactivated');
    }

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: { status: dto.status },
    });
    const subject =
      promotion.type === 'FEATURED_PRODUCT'
        ? (promotion.product?.name ?? 'product')
        : `${promotion.vendor.storeName} store`;
    const cancelled = dto.status === 'CANCELLED';
    this.analyticsCache.invalidateVendor(promotion.vendorId);
    await this.activity.record(actor ?? null, {
      action: ActivityAction.PROMOTION_STATUS_CHANGED,
      summary: `${cancelled ? 'Deactivated' : 'Reactivated'} featured listing for ${subject}${dto.reason ? `: ${dto.reason}` : ''}`,
      entityType: 'Promotion',
      entityId: id,
      metadata: { from: promotion.status, to: dto.status, reason: dto.reason ?? null },
    });
    await this.notifications.notifyVendor(promotion.vendorId, {
      type: cancelled ? NotificationType.PROMOTION_CANCELLED : NotificationType.PROMOTION_ACTIVE,
      severity: cancelled ? 'warning' : 'success',
      title: cancelled
        ? `Featured listing for ${subject} was deactivated`
        : `Featured listing for ${subject} is live again`,
      body: dto.reason,
      link: '/vendor/dashboard/promotions',
    });
    return updated;
  }
}
