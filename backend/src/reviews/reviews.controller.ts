import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyReviewDto, VendorReviewListQueryDto } from './dto/reply-review.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createReview(@Request() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createOrUpdateReview(req.user.userId, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyReviews(@Request() req: any) {
    return this.reviewsService.getMyReviews(req.user.userId);
  }

  @Get('product/:productId')
  async getProductReviews(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviews(productId);
  }

  // Must stay above vendor/:vendorId so "me" isn't read as an id.
  @Get('vendor/me')
  @UseGuards(JwtAuthGuard)
  async getMyVendorReviews(@Request() req: any, @Query() query: VendorReviewListQueryDto) {
    return this.reviewsService.getVendorReviewList(req.user.userId, {
      filter: query.filter ?? 'all',
      q: query.q,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    });
  }

  @Patch(':id/reply')
  @UseGuards(JwtAuthGuard)
  async replyToReview(@Request() req: any, @Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.reviewsService.replyToReview(req.user.userId, id, dto.reply);
  }

  @Get('vendor/:vendorId')
  async getVendorReviews(@Param('vendorId') vendorId: string) {
    return this.reviewsService.getVendorReviews(vendorId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteReview(@Request() req: any, @Param('id') id: string) {
    return this.reviewsService.deleteReview(req.user.userId, id);
  }
}
