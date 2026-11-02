import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProductViewsService } from './product-views.service';

// Public, unauthenticated: storefront visitors call this once per product
// page view. See ProductViewsService for the privacy/dedup design.
@Controller('analytics/track')
export class TrackingController {
  constructor(private readonly views: ProductViewsService) {}

  @Post('product-view/:productId')
  @HttpCode(202)
  async productView(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: Request,
  ) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(',')[0]
        ?.trim() || req.ip;
    await this.views.record(productId, {
      ip,
      userAgent: req.headers['user-agent'],
    });
    return { ok: true };
  }
}
