import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsInt,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class ShippingQuoteItemDto {
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

export class CreateShippingQuoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShippingQuoteItemDto)
  @ArrayMinSize(1)
  items: ShippingQuoteItemDto[];
}
