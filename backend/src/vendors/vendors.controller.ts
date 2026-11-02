
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import {
  CreateShippingOptionDto,
  UpdateShippingOptionDto,
} from './dto/vendor-shipping.dto';
import { CreateShippingQuoteDto } from './dto/shipping-quote.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  findAll() {
    return this.vendorsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post('register')
  create(@Request() req: any, @Body() createVendorDto: CreateVendorDto) {
    return this.vendorsService.create(req.user.userId, createVendorDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMe(@Request() req: any) {
    return this.vendorsService.findByUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Request() req: any, @Body() updateVendorDto: UpdateVendorDto) {
    return this.vendorsService.update(req.user.userId, updateVendorDto);
  }

  // --- Vendor Shipping Options (authenticated) ---

  @UseGuards(JwtAuthGuard)
  @Get('me/shipping')
  getMyShippingOptions(@Request() req: any) {
    return this.vendorsService.getShippingOptions(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/shipping')
  createShippingOption(
    @Request() req: any,
    @Body() dto: CreateShippingOptionDto,
  ) {
    return this.vendorsService.createShippingOption(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/shipping/:optionId')
  updateShippingOption(
    @Request() req: any,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateShippingOptionDto,
  ) {
    return this.vendorsService.updateShippingOption(
      req.user.userId,
      optionId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/shipping/:optionId')
  deleteShippingOption(
    @Request() req: any,
    @Param('optionId') optionId: string,
  ) {
    return this.vendorsService.deleteShippingOption(req.user.userId, optionId);
  }

  // --- Public endpoints ---

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findById(id);
  }

  @Get(':id/shipping')
  getVendorShippingOptions(@Param('id') id: string) {
    return this.vendorsService.getVendorShippingOptionsPublic(id);
  }

  @Post(':id/shipping/quote')
  getShippingQuote(
    @Param('id') id: string,
    @Body() dto: CreateShippingQuoteDto,
  ) {
    return this.vendorsService.getShippingQuote(id, dto.items);
  }
}
