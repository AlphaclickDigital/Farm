import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CATALOG_SORTS = [
  'recommended',
  'newest',
  'price-asc',
  'price-desc',
  'best-selling',
  'top-rated',
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const FARM_SORTS = ['recommended', 'top-rated', 'products', 'newest', 'name'] as const;
export type FarmSort = (typeof FARM_SORTS)[number];

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Comma-separated category slugs. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  category?: string;

  /** Comma-separated vendor ids. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  farm?: string;

  /** Comma-separated state codes (VIC, NSW, ...). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(toBool)
  inStock?: boolean;

  @IsOptional()
  @Transform(toBool)
  onSale?: boolean;

  @IsOptional()
  @Transform(toBool)
  featured?: boolean;

  /** Product id to leave out, e.g. the product a "related" shelf sits on. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  exclude?: string;

  @IsOptional()
  @IsIn(CATALOG_SORTS)
  sort?: CatalogSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number;
}

export class SuggestQueryDto {
  @IsString()
  @MaxLength(100)
  q: string;
}

export class FarmsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsIn(FARM_SORTS)
  sort?: FarmSort;
}
