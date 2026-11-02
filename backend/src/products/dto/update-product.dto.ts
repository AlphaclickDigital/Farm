import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  IsBoolean,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class UpdateVariantDto {
  @IsString()
  @IsOptional()
  id?: string;

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

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  baseUnit?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockAmount?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  categoryId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  @ArrayMinSize(1)
  @IsOptional()
  variants?: UpdateVariantDto[];

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
