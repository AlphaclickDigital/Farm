import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Customer endpoints
  @Get('my-orders')
  async getMyOrders(@Request() req: any) {
    return this.ordersService.findCustomerOrders(req.user.userId);
  }

  @Get('my-orders/:id')
  async getMyOrder(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.findCustomerOrder(req.user.userId, id);
  }

  // Vendor endpoints
  @Get('vendor/orders')
  async getVendorOrders(@Request() req: any) {
    return this.ordersService.findVendorOrders(req.user.userId);
  }

  @Get('vendor/orders/:id')
  async getVendorOrder(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.findVendorOrder(req.user.userId, id);
  }

  @Patch('vendor/orders/:id/status')
  async updateOrderStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateVendorOrderStatus(
      req.user.userId,
      id,
      updateOrderStatusDto.status,
    );
  }

  @Patch('vendor/orders/:id/tracking')
  async updateTracking(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateTrackingDto: UpdateTrackingDto,
  ) {
    return this.ordersService.updateTracking(
      req.user.userId,
      id,
      updateTrackingDto.trackingNumber,
      updateTrackingDto.trackingUrl,
    );
  }

  @Patch('vendor/orders/:id/address')
  async updateShippingAddress(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateShippingAddressDto,
  ) {
    return this.ordersService.updateShippingAddress(req.user.userId, id, dto);
  }

  @Get('vendor/stats')
  async getVendorStats(@Request() req: any) {
    return this.ordersService.getVendorStats(req.user.userId);
  }

  @Post('vendor/orders/:id/refund')
  async refundVendorOrder(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.refundVendorOrderAsVendor(req.user.userId, id);
  }

  // Admin endpoint
  @Post('admin/orders/:id/refund')
  @UseGuards(AdminGuard)
  async adminRefundVendorOrder(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.refundVendorOrderAsAdmin(id, req.user);
  }
}
