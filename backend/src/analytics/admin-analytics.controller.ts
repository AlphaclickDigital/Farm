import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AnalyticsCacheService } from './cache/analytics-cache.service';
import { resolveRange } from './reporting/date-range';
import {
  ActivityQueryDto,
  AdminTransactionsQueryDto,
  AuditQueryDto,
  LeaderboardQueryDto,
  OrderListQueryDto,
  PromotionListQueryDto,
  RangeQueryDto,
} from './dto/analytics-query.dto';
import {
  ADMIN_EXPORTS,
  AdminAnalyticsService,
  AdminExport,
} from './services/admin-analytics.service';
import { FinanceAnalyticsService } from './services/finance-analytics.service';
import { CustomerAnalyticsService } from './services/customer-analytics.service';
import { PromotionAnalyticsService } from './services/promotion-analytics.service';

@Controller('analytics/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAnalyticsController {
  constructor(
    private readonly analytics: AdminAnalyticsService,
    private readonly finance: FinanceAnalyticsService,
    private readonly customers: CustomerAnalyticsService,
    private readonly promotions: PromotionAnalyticsService,
    private readonly cache: AnalyticsCacheService,
  ) {}

  private cached<T>(name: string, params: object, compute: () => Promise<T>) {
    return this.cache.wrap(
      AnalyticsCacheService.key('admin', name, params),
      compute,
    );
  }

  @Get('kpis')
  kpis(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('kpis', query, () => this.analytics.kpis(range));
  }

  @Get('revenue')
  revenue(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('revenue', query, () =>
      this.finance.marketplaceRevenue(range),
    );
  }

  @Get('finance')
  financeOverview(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('finance', query, () =>
      this.finance.marketplaceFinance(range),
    );
  }

  @Get('transactions')
  transactions(@Query() query: AdminTransactionsQueryDto) {
    const range = query.allTime === 'true' ? null : resolveRange(query);
    return this.finance.marketplaceTransactions({
      type: query.type ?? 'all',
      from: range?.from,
      to: range?.to,
      q: query.q,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    });
  }

  @Get('vendors')
  vendors(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('vendors', query, () =>
      this.analytics.vendorOverview(range),
    );
  }

  @Get('vendors/leaderboard')
  leaderboard(@Query() query: LeaderboardQueryDto) {
    const range = resolveRange(query);
    return this.cached('leaderboard', query, () =>
      this.analytics.leaderboard(range, {
        state: query.state,
        status: query.status,
        stripe: query.stripe,
        performance: query.performance,
        registeredFrom: query.registeredFrom,
        registeredTo: query.registeredTo,
        q: query.q,
        sort: query.sort ?? 'gmv',
        dir: query.dir ?? 'desc',
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      }),
    );
  }

  @Get('products')
  products(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('products', query, () =>
      this.analytics.productOverview(range),
    );
  }

  @Get('orders/overview')
  orderOverview(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('orders-overview', query, () =>
      this.analytics.orderOverview(range),
    );
  }

  @Get('orders')
  orders(@Query() query: OrderListQueryDto) {
    const range = query.allTime === 'true' ? null : resolveRange(query);
    return this.analytics.listOrders({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      status: query.status,
      q: query.q,
      vendorId: query.vendorId,
      state: query.state,
      sort: query.sort,
      dir: query.dir,
      from: range?.from,
      to: range?.to,
    });
  }

  @Get('orders/:id')
  orderDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.orderDetail(id);
  }

  @Get('customers')
  customerReport(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('customers', query, () =>
      this.customers.marketplaceCustomers(range),
    );
  }

  @Get('promotions')
  promotionOverview(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('promotions', query, () =>
      this.analytics.promotionsOverview(range),
    );
  }

  @Get('promotions/list')
  promotionList(@Query() query: PromotionListQueryDto) {
    return this.promotions.list({
      state: query.state ?? 'all',
      type: query.type,
      q: query.q,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  @Get('geography')
  geography(@Query() query: RangeQueryDto) {
    const range = resolveRange(query);
    return this.cached('geography', query, () =>
      this.analytics.geography(range),
    );
  }

  @Get('alerts')
  alerts() {
    return this.cached('alerts', {}, () => this.analytics.alerts());
  }

  @Get('activity')
  activity(@Query() query: ActivityQueryDto) {
    return this.analytics.activityFeed(query.limit ?? 30);
  }

  @Get('audit')
  audit(@Query() query: AuditQueryDto) {
    return this.analytics.auditLog({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
      action: query.action,
    });
  }

  @Get('export/:report')
  async export(
    @Param('report') report: string,
    @Query() query: RangeQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!ADMIN_EXPORTS.includes(report as AdminExport)) {
      throw new BadRequestException(`Unknown report "${report}"`);
    }
    const range = resolveRange(query);
    const csv = await this.analytics.exportCsv(report as AdminExport, range);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="marketplace-${report}-${range.startDate}-to-${range.endDate}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return csv;
  }
}
