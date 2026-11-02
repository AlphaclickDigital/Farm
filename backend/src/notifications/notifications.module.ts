import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MarketplaceEventsService } from './marketplace-events.service';

// Global: notifications are raised from many modules (payments, orders,
// payouts, reviews, admin) and would otherwise need importing everywhere.
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, MarketplaceEventsService],
  exports: [NotificationsService, MarketplaceEventsService],
})
export class NotificationsModule {}
