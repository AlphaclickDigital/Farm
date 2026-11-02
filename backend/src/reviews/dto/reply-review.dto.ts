import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VENDOR_REVIEW_FILTERS } from '../reviews.service';

export class ReplyReviewDto {
  @IsString()
  @MaxLength(1000)
  reply: string;
}

export class VendorReviewListQueryDto {
  @IsOptional()
  @IsIn(VENDOR_REVIEW_FILTERS)
  filter?: (typeof VENDOR_REVIEW_FILTERS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
