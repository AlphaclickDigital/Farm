import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsDateString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsInt()
  @Min(1)
  unitAmount: number;

  @IsInt()
  @Min(1)
  priceCents: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  weightGrams?: number;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  baseUnit: string;

  @IsInt()
  @Min(0)
  stockAmount: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @ArrayMinSize(1)
  variants: CreateVariantDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @IsString()
  @IsOptional()
  discountName?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  discountCents?: number;

  @IsDateString()
  @IsOptional()
  discountEndsAt?: string;
}
