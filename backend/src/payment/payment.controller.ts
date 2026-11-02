import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  async createPaymentIntent(
    @Request() req: any,
    @Body() createPaymentIntentDto: CreatePaymentIntentDto,
  ) {
    return this.paymentService.createPaymentIntent(
      req.user.userId,
      createPaymentIntentDto,
    );
  }

  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @Request() req: any,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    // Only the payment intent id is used: the order is built from the
    // checkout persisted by create-intent, not from client-submitted items.
    return this.paymentService.createOrderFromPayment(
      req.user.userId,
      createOrderDto.paymentIntentId,
    );
  }
}
