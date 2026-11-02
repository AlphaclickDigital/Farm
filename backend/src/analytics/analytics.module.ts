import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VendorAnalyticsController } from './vendor-analytics.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { TrackingController } from './tracking.controller';
import { VendorGuard } from './vendor.guard';
import { ProductViewsService } from './product-views.service';
import { SalesAnalyticsService } from './services/sales-analytics.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';
import { ProductAnalyticsService } from './services/product-analytics.service';
import { FinanceAnalyticsService } from './services/finance-analytics.service';
import { CustomerAnalyticsService } from './services/customer-analytics.service';
import { ReviewAnalyticsService } from './services/review-analytics.service';
import { PromotionAnalyticsService } from './services/promotion-analytics.service';
import { VendorAnalyticsService } from './services/vendor-analytics.service';
import { AdminAnalyticsService } from './services/admin-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    VendorAnalyticsController,
    AdminAnalyticsController,
    TrackingController,
  ],
  providers: [
    VendorGuard,
    ProductViewsService,
    SalesAnalyticsService,
    InventoryAnalyticsService,
    ProductAnalyticsService,
    FinanceAnalyticsService,
    CustomerAnalyticsService,
    ReviewAnalyticsService,
    PromotionAnalyticsService,
    VendorAnalyticsService,
    AdminAnalyticsService,
  ],
  exports: [InventoryAnalyticsService],
})
export class AnalyticsModule {}
