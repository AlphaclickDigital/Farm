import { IsString, IsOptional } from 'class-validator';

export class UpdateShippingAddressDto {
  @IsString()
  @IsOptional()
  shippingName?: string;

  @IsString()
  @IsOptional()
  shippingAddress?: string;

  @IsString()
  @IsOptional()
  shippingCity?: string;

  @IsString()
  @IsOptional()
  shippingState?: string;

  @IsString()
  @IsOptional()
  shippingZip?: string;

  @IsString()
  @IsOptional()
  shippingPhone?: string;
}
