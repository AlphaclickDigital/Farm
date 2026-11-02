import { IsEnum, IsString, IsOptional } from 'class-validator';
import { PromotionType } from '@prisma/client';

export class CreatePromotionIntentDto {
  @IsEnum(PromotionType)
  type: PromotionType;

  @IsString()
  @IsOptional()
  productId?: string;
}
