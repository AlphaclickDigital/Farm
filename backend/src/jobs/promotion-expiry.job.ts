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
 *
 * On a long-running server it runs hourly in-process; set
 * DISABLE_BACKGROUND_JOBS=true to turn that off (e.g. when running several
 * API instances or test servers). On Vercel the in-process timer never
 * starts — serverless instances freeze between requests — and Vercel Cron
 * calls GET /cron/promotion-expiry instead (see CronController, vercel.json).
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
    if (process.env.VERCEL) return;
    // run() logs and rethrows; swallow here so a failed run can't become an
    // unhandled rejection that takes the process down.
    const tick = () => void this.run().catch(() => undefined);
    this.timer = setInterval(tick, INTERVAL_MS);
    this.timer.unref();
    setTimeout(tick, 10_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many promotions this run expired. */
  async run(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const candidates = await this.prisma.promotion.findMany({
        where: { status: 'ACTIVE', endDate: { lt: new Date() } },
        include: {
          product: { select: { name: true } },
          vendor: { select: { storeName: true } },
        },
      });
      if (candidates.length === 0) return 0;

      // Claim each row with an update conditional on status, and only notify
      // for the rows this run actually flipped. That keeps a concurrent admin
      // change intact and makes overlapping runs (Vercel Cron can deliver the
      // same schedule twice, on separate instances) send each email once.
      const expired: typeof candidates = [];
      for (const promo of candidates) {
        const { count } = await this.prisma.promotion.updateMany({
          where: { id: promo.id, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        if (count === 1) expired.push(promo);
      }
      if (expired.length === 0) return 0;

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
      return expired.length;
    } catch (error) {
      this.logger.error('Promotion expiry run failed', error as Error);
      throw error;
    } finally {
      this.running = false;
    }
  }
}
