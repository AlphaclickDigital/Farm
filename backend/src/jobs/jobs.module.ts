import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromotionExpiryJob } from './promotion-expiry.job';

@Module({
  imports: [PrismaModule],
  providers: [PromotionExpiryJob],
})
export class JobsModule {}
