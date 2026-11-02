import { Controller, Get, Post, Param, Request, UseGuards } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('me/balance')
  @UseGuards(JwtAuthGuard)
  async getBalance(@Request() req: any) {
    return this.payoutsService.getBalance(req.user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyPayouts(@Request() req: any) {
    return this.payoutsService.getMyHistory(req.user.userId);
  }

  @Post('me/request')
  @UseGuards(JwtAuthGuard)
  async requestPayout(@Request() req: any) {
    return this.payoutsService.requestPayoutForUser(req.user.userId);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllPayouts() {
    return this.payoutsService.getAllPayouts();
  }

  @Post('admin/:vendorId/force')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async forcePayout(@Request() req: any, @Param('vendorId') vendorId: string) {
    return this.payoutsService.forcePayout(vendorId, req.user);
  }

  @Post('admin/payout/:payoutId/retry')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async retryPayout(@Request() req: any, @Param('payoutId') payoutId: string) {
    return this.payoutsService.retryPayout(payoutId, req.user);
  }
}
