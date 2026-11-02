import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class CartItemDto {
  @IsString()
  productId: string;

  @IsString()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(1)
  priceCents: number;
}

export class VendorShippingSelectionDto {
  @IsString()
  vendorId: string;

  @IsString()
  shippingOptionId: string;
}

export class ShippingAddressDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  zip: string;

  @IsString()
  phone: string;
}

export class CreatePaymentIntentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  @ArrayMinSize(1)
  items: CartItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorShippingSelectionDto)
  @IsOptional()
  shippingSelections?: VendorShippingSelectionDto[];

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  @IsOptional()
  shippingAddress?: ShippingAddressDto;
}
