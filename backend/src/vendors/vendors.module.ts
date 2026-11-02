import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ShippingCalculatorService } from './shipping-calculator.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorsController],
  providers: [VendorsService, ShippingCalculatorService],
  exports: [ShippingCalculatorService],
})
export class VendorsModule {}
