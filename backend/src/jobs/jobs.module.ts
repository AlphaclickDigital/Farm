import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromotionExpiryJob } from './promotion-expiry.job';
import { CronController } from './cron.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CronController],
  providers: [PromotionExpiryJob],
})
export class JobsModule {}
