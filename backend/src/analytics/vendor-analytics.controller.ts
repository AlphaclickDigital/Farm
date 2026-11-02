import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorGuard } from './vendor.guard';
import { AnalyticsCacheService } from './cache/analytics-cache.service';
import { resolveRange } from './reporting/date-range';
import {
  OrderListQueryDto,
  ProductPerformanceQueryDto,
  RangeQueryDto,
  VendorLedgerQueryDto,
} from './dto/analytics-query.dto';
import {
  VENDOR_EXPORTS,
  VendorAnalyticsService,
  VendorExport,
} from './services/vendor-analytics.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';
import { ProductAnalyticsService } from './services/product-analytics.service';
import { FinanceAnalyticsService } from './services/finance-analytics.service';
import { CustomerAnalyticsService } from './services/customer-analytics.service';
import { ReviewAnalyticsService } from './services/review-analytics.service';

interface VendorRequest {
  vendorId: string;
}

// Every route is scoped to req.vendorId, which VendorGuard derives from the
// authenticated user — there is deliberately no vendorId parameter anywhere.
@Controller('analytics/vendor')
@UseGuards(JwtAuthGuard, VendorGuard)
export class VendorAnalyticsController {
  constructor(
    private readonly analytics: VendorAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly products: ProductAnalyticsService,
    private readonly finance: FinanceAnalyticsService,
    private readonly customers: CustomerAnalyticsService,
    private readonly reviews: ReviewAnalyticsService,
    private readonly cache: AnalyticsCacheService,
  ) {}

  private cached<T>(
    req: VendorRequest,
    name: string,
    params: object,
    compute: () => Promise<T>,
  ) {
    return this.cache.wrap(
      AnalyticsCacheService.key(`vendor:${req.vendorId}`, name, params),
      compute,
    );
  }

  @Get('summary')
  summary(@Req() req: VendorRequest) {
    return this.cached(req, 'summary', {}, () =>
      this.analytics.summary(req.vendorId),
    );
  }

  @Get('kpis')
  kpis(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'kpis', query, () =>
      this.analytics.kpis(req.vendorId, range),
    );
  }

  @Get('sales')
  sales(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'sales', query, () =>
      this.analytics.salesSeries(req.vendorId, range),
    );
  }

  @Get('breakdown')
  breakdown(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'breakdown', query, () =>
      this.analytics.breakdown(req.vendorId, range),
    );
  }

  @Get('orders/insights')
  orderInsights(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'order-insights', query, () =>
      this.analytics.orderInsights(req.vendorId, range),
    );
  }

  // Operational list: not cached so status changes show immediately.
  @Get('orders')
  orders(@Req() req: VendorRequest, @Query() query: OrderListQueryDto) {
    const range = query.allTime === 'true' ? null : resolveRange(query);
    return this.analytics.listOrders(req.vendorId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      status: query.status,
      q: query.q,
      sort: query.sort,
      dir: query.dir,
      from: range?.from,
      to: range?.to,
    });
  }

  @Get('inventory')
  inventoryReport(@Req() req: VendorRequest) {
    return this.cached(req, 'inventory', {}, () =>
      this.inventory.vendorInventory(req.vendorId),
    );
  }

  @Get('products')
  productPerformance(
    @Req() req: VendorRequest,
    @Query() query: ProductPerformanceQueryDto,
  ) {
    const range = resolveRange(query);
    return this.cached(req, 'products', query, async () => {
      const { allRows: _all, ...page } =
        await this.products.vendorProductPerformance(req.vendorId, range, {
          filter: query.filter ?? 'all',
          q: query.q,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        });
      void _all;
      return page;
    });
  }

  @Get('finance')
  financeReport(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'finance', query, () =>
      this.finance.vendorFinance(req.vendorId, range),
    );
  }

  @Get('transactions')
  transactions(
    @Req() req: VendorRequest,
    @Query() query: VendorLedgerQueryDto,
  ) {
    const range = query.allTime === 'true' ? null : resolveRange(query);
    return this.finance.vendorLedger(req.vendorId, {
      type: query.type ?? 'all',
      from: range?.from,
      to: range?.to,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  @Get('customers')
  customerReport(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'customers', query, () =>
      this.customers.vendorCustomers(req.vendorId, range),
    );
  }

  @Get('reviews')
  reviewReport(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'reviews', query, () =>
      this.reviews.vendorReviews(req.vendorId, range),
    );
  }

  @Get('insights')
  insights(@Req() req: VendorRequest, @Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached(req, 'insights', query, () =>
      this.analytics.insights(req.vendorId, range),
    );
  }

  @Get('export/:report')
  async export(
    @Req() req: VendorRequest,
    @Param('report') report: string,
    @Query() query: ProductPerformanceQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!VENDOR_EXPORTS.includes(report as VendorExport)) {
      throw new BadRequestException(`Unknown report "${report}"`);
    }
    const range = resolveRange(query);
    const csv = await this.analytics.exportCsv(
      req.vendorId,
      report as VendorExport,
      range,
      query.filter,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report}-${range.startDate}-to-${range.endDate}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return csv;
  }
}
