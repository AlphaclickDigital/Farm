import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CreatePromotionIntentDto } from './dto/create-promotion-intent.dto';
import { ConfirmPromotionDto } from './dto/confirm-promotion.dto';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post('intent')
  @UseGuards(JwtAuthGuard)
  async createIntent(@Request() req: any, @Body() dto: CreatePromotionIntentDto) {
    return this.promotionsService.createIntent(req.user.userId, dto);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  async confirmPromotion(@Request() req: any, @Body() dto: ConfirmPromotionDto) {
    return this.promotionsService.confirmPromotion(req.user.userId, dto.paymentIntentId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyPromotions(@Request() req: any) {
    return this.promotionsService.getMyPromotions(req.user.userId);
  }

  @Get('featured-products')
  async getFeaturedProducts() {
    return this.promotionsService.getFeaturedProducts();
  }

  @Get('featured-vendors')
  async getFeaturedVendors() {
    return this.promotionsService.getFeaturedVendors();
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllPromotions() {
    return this.promotionsService.getAllPromotions();
  }
}
