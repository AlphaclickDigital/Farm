import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import {
  CartItemDto,
  VendorShippingSelectionDto,
  ShippingAddressDto,
} from './create-payment-intent.dto';

export class CreateOrderDto {
  @IsString()
  paymentIntentId: string;

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
