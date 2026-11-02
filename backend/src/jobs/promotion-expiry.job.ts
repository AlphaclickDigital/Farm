import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationType,
  NotificationsService,
} from '../notifications/notifications.service';
import {
  ActivityAction,
  ActivityLogService,
} from '../activity/activity-log.service';
import { AnalyticsCacheService } from '../analytics/cache/analytics-cache.service';

const INTERVAL_MS = 60 * 60 * 1000;

/**
 * Flips ACTIVE promotions whose end date has passed to EXPIRED and tells the
 * vendor. The storefront already hides ended promotions by date, so this
 * only keeps the stored status (and dashboards that filter on it) honest.
 * Runs hourly in-process; set DISABLE_BACKGROUND_JOBS=true to turn it off
 * (e.g. when running several API instances or test servers).
 */
@Injectable()
export class PromotionExpiryJob
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PromotionExpiryJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private activity: ActivityLogService,
    private cache: AnalyticsCacheService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.DISABLE_BACKGROUND_JOBS === 'true') return;
    this.timer = setInterval(() => void this.run(), INTERVAL_MS);
    this.timer.unref();
    setTimeout(() => void this.run(), 10_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.prisma.promotion.findMany({
        where: { status: 'ACTIVE', endDate: { lt: new Date() } },
        include: {
          product: { select: { name: true } },
          vendor: { select: { storeName: true } },
        },
      });
      if (expired.length === 0) return;

      // Conditional on status so a concurrent admin change isn't overwritten.
      await this.prisma.promotion.updateMany({
        where: { id: { in: expired.map((p) => p.id) }, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });

      for (const promo of expired) {
        const subject =
          promo.type === 'FEATURED_PRODUCT'
            ? (promo.product?.name ?? 'your product')
            : 'your store';
        await this.notifications.notifyVendor(promo.vendorId, {
          type: NotificationType.PROMOTION_EXPIRED,
          title: `Featured listing for ${subject} has ended`,
          body: 'Renew it any time from Promotions.',
          link: '/vendor/dashboard/promotions',
        });
        this.cache.invalidateVendor(promo.vendorId);
      }
      await this.activity.record(null, {
        action: ActivityAction.PROMOTION_EXPIRED,
        summary: `${expired.length} featured listing${expired.length === 1 ? '' : 's'} expired`,
        entityType: 'Promotion',
        metadata: { ids: expired.map((p) => p.id) },
      });
      this.logger.log(`Expired ${expired.length} promotion(s)`);
    } catch (error) {
      this.logger.error('Promotion expiry run failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
