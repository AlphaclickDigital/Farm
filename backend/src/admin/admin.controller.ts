import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { UpdateConfigurationDto } from './dto/update-configuration.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AdminUpdateVendorDto } from './dto/admin-update-vendor.dto';
import { UpdatePromotionStatusDto } from './dto/update-promotion-status.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ───── Vendor Management ─────
  // IMPORTANT: specific routes must come BEFORE parameterized routes

  @Get('vendors/pending')
  async getPendingVendors() {
    return this.adminService.getPendingVendors();
  }

  @Get('vendors')
  async getAllVendors() {
    return this.adminService.getAllVendors();
  }

  @Get('vendors/:id')
  async getVendorById(@Param('id') id: string) {
    return this.adminService.getVendorById(id);
  }

  @Post('vendors/:id/approve')
  async approveVendor(@Request() req: any, @Param('id') id: string) {
    return this.adminService.approveVendor(id, req.user);
  }

  @Post('vendors/:id/reject')
  async rejectVendor(@Request() req: any, @Param('id') id: string) {
    return this.adminService.rejectVendor(id, req.user);
  }

  @Patch('vendors/:id')
  async adminUpdateVendor(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: AdminUpdateVendorDto,
  ) {
    return this.adminService.adminUpdateVendor(id, dto, req.user);
  }

  @Post('vendors/:id/suspend')
  async suspendVendor(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.adminService.suspendVendor(id, body.reason, req.user);
  }

  @Post('vendors/:id/unsuspend')
  async unsuspendVendor(@Request() req: any, @Param('id') id: string) {
    return this.adminService.unsuspendVendor(id, req.user);
  }

  // ───── Category Management ─────

  @Get('categories')
  async getAllCategories() {
    return this.adminService.getAllCategories();
  }

  @Post('categories')
  async createCategory(@Request() req: any, @Body() dto: CreateCategoryDto) {
    return this.adminService.createCategory(dto, req.user);
  }

  @Patch('categories/:id')
  async updateCategory(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.adminService.updateCategory(id, dto, req.user);
  }

  @Delete('categories/:id')
  async deleteCategory(@Request() req: any, @Param('id') id: string) {
    return this.adminService.deleteCategory(id, req.user);
  }

  // ───── Statistics ─────

  @Get('stats')
  async getPlatformStats() {
    return this.adminService.getPlatformStats();
  }

  // ───── User Management ─────

  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  // ───── Order Management ─────

  @Get('orders')
  async getAllOrders() {
    return this.adminService.getAllOrders();
  }

  // ───── Configuration ─────

  @Get('configuration')
  async getConfiguration() {
    return this.adminService.getConfiguration();
  }

  @Patch('configuration/:key')
  async updateConfiguration(
    @Request() req: any,
    @Param('key') key: string,
    @Body() dto: UpdateConfigurationDto,
  ) {
    return this.adminService.updateConfiguration(key, dto, req.user);
  }

  // ───── Promotion moderation ─────

  @Patch('promotions/:id/status')
  async updatePromotionStatus(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionStatusDto,
  ) {
    return this.adminService.updatePromotionStatus(id, dto, req.user);
  }
}
