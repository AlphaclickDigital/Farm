import { IsString, IsOptional } from 'class-validator';

export class UpdateTrackingDto {
  @IsString()
  trackingNumber: string;

  @IsString()
  @IsOptional()
  trackingUrl?: string;
}
