import {
  Controller,
  Post,
  Get,
  Request,
  UseGuards,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import Stripe from 'stripe';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentService: PaymentService,
    public prisma: PrismaService,
  ) {}

  @Post('connect/account')
  @UseGuards(JwtAuthGuard)
  async createConnectAccount(@Request() req: any) {
    // Get vendor from user
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: req.user.userId },
    });

    if (!vendor) {
      throw new BadRequestException('Vendor profile not found');
    }

    return this.stripeService.createConnectAccount(vendor.id);
  }

  @Post('connect/account-link')
  @UseGuards(JwtAuthGuard)
  async createAccountLink(@Request() req: any) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: req.user.userId },
    });

    if (!vendor) {
      throw new BadRequestException('Vendor profile not found');
    }

    return this.stripeService.createAccountLink(vendor.id);
  }

  @Get('connect/status')
  @UseGuards(JwtAuthGuard)
  async getAccountStatus(@Request() req: any) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: req.user.userId },
    });

    if (!vendor) {
      throw new BadRequestException('Vendor profile not found');
    }

    return this.stripeService.getAccountStatus(vendor.id);
  }

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<ExpressRequest>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    const event = await this.stripeService.handleWebhook(signature, req.rawBody);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await this.paymentService.reconcilePaymentIntent(paymentIntent.id);
    }

    return { received: true };
  }
}
