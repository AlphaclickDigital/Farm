import { Global, Module } from '@nestjs/common';
import { AnalyticsCacheService } from './analytics-cache.service';

// Global so the services that mutate orders, payouts, products, promotions
// and reviews can invalidate cached analytics without importing AnalyticsModule.
@Global()
@Module({
  providers: [AnalyticsCacheService],
  exports: [AnalyticsCacheService],
})
export class AnalyticsCacheModule {}
