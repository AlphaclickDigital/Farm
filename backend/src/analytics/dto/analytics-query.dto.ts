import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { GRANULARITIES, RANGE_PRESETS } from '../reporting/date-range';
import { PRODUCT_FILTERS } from '../services/product-analytics.service';
import {
  ADMIN_TXN_TYPES,
  VENDOR_LEDGER_TYPES,
} from '../services/finance-analytics.service';
import { PROMOTION_STATES } from '../services/promotion-analytics.service';
import { LEADERBOARD_SORTS } from '../services/admin-analytics.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The global ValidationPipe uses whitelist: true, so every accepted query
// parameter must be declared here or it is silently stripped.
export class RangeQueryDto {
  @IsOptional()
  @IsIn(RANGE_PRESETS)
  range?: string;

  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(GRANULARITIES)
  granularity?: string;
}

export class PagedRangeQueryDto extends RangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  /** When "true", the range filter is ignored (list every record). */
  @IsOptional()
  @IsIn(['true', 'false'])
  allTime?: string;
}

export class OrderListQueryDto extends PagedRangeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsIn(['date', 'amount', 'status'])
  sort?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  state?: string;
}

export class ProductPerformanceQueryDto extends PagedRangeQueryDto {
  @IsOptional()
  @IsIn(PRODUCT_FILTERS)
  filter?: (typeof PRODUCT_FILTERS)[number];
}

export class VendorLedgerQueryDto extends PagedRangeQueryDto {
  @IsOptional()
  @IsIn(VENDOR_LEDGER_TYPES)
  type?: (typeof VENDOR_LEDGER_TYPES)[number];
}

export class AdminTransactionsQueryDto extends PagedRangeQueryDto {
  @IsOptional()
  @IsIn(ADMIN_TXN_TYPES)
  type?: (typeof ADMIN_TXN_TYPES)[number];
}

export class LeaderboardQueryDto extends PagedRangeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  state?: string;

  @IsOptional()
  @IsIn(['approved', 'pending', 'suspended'])
  status?: 'approved' | 'pending' | 'suspended';

  @IsOptional()
  @IsIn(['ready', 'incomplete', 'none'])
  stripe?: 'ready' | 'incomplete' | 'none';

  @IsOptional()
  @IsIn(['selling', 'no_sales', 'declining'])
  performance?: 'selling' | 'no_sales' | 'declining';

  @IsOptional()
  @Matches(DATE)
  registeredFrom?: string;

  @IsOptional()
  @Matches(DATE)
  registeredTo?: string;

  @IsOptional()
  @IsIn(LEADERBOARD_SORTS)
  sort?: (typeof LEADERBOARD_SORTS)[number];
}

export class PromotionListQueryDto extends PagedRangeQueryDto {
  @IsOptional()
  @IsIn(PROMOTION_STATES)
  state?: (typeof PROMOTION_STATES)[number];

  @IsOptional()
  @IsIn(['FEATURED_PRODUCT', 'FEATURED_VENDOR'])
  type?: 'FEATURED_PRODUCT' | 'FEATURED_VENDOR';
}

export class ActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;
}
