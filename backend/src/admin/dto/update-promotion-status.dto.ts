import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePromotionStatusDto {
  @IsIn(['ACTIVE', 'CANCELLED'])
  status: 'ACTIVE' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
