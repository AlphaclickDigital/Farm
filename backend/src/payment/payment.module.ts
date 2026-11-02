import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { VendorsModule } from '../vendors/vendors.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, ConfigModule, VendorsModule, EmailModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
