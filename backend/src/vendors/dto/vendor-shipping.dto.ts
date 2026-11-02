import { Type } from 'class-transformer';
import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  ValidateIf,
  Min,
} from 'class-validator';
import { ShippingMethodType } from '@prisma/client';

export class CreateWeightTierDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  maxGrams?: number; // omit only on the last tier in the array — open-ended

  @IsInt()
  @Min(0)
  priceCents: number;
}

export class CreateShippingOptionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ShippingMethodType)
  type: ShippingMethodType;

  @ValidateIf(
    (o: CreateShippingOptionDto) => o.type === ShippingMethodType.FLAT_RATE,
  )
  @IsInt()
  @Min(0)
  flatRateCents?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minOrderCents?: number;

  @IsString()
  estimatedDays: string;

  @ValidateIf(
    (o: CreateShippingOptionDto) => o.type === ShippingMethodType.WEIGHT_BASED,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWeightTierDto)
  weightTiers?: CreateWeightTierDto[];
}

export class UpdateShippingOptionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ShippingMethodType)
  @IsOptional()
  type?: ShippingMethodType;

  @ValidateIf(
    (o: UpdateShippingOptionDto) => o.type === ShippingMethodType.FLAT_RATE,
  )
  @IsInt()
  @Min(0)
  flatRateCents?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minOrderCents?: number;

  @IsString()
  @IsOptional()
  estimatedDays?: string;

  @ValidateIf(
    (o: UpdateShippingOptionDto) => o.type === ShippingMethodType.WEIGHT_BASED,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWeightTierDto)
  weightTiers?: CreateWeightTierDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
