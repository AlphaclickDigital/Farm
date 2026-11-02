import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, PromotionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { effectivePriceCents, hasActiveDiscount } from '../products/product-pricing';
import type { CatalogQueryDto, CatalogSort, FarmsQueryDto } from './dto/storefront-query.dto';

// Order lines that represent a real sale (paid and not cancelled/refunded).
const SOLD_STATUSES: OrderStatus[] = ['PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED'];

const ANNOUNCEMENT_KEY = 'storefront_announcement';
const DEFAULT_ANNOUNCEMENTS = [
  'Buy direct from independent Australian farms',
  'Every farm sets its own delivery and pickup options',
  'Reviews come only from customers with a completed order',
];

// Weight given to the marketplace-wide mean when ranking by rating, so one
// 5-star review does not outrank thirty 4.8-star reviews.
const RATING_PRIOR_WEIGHT = 3;

const publicVendor = { isApproved: true, isSuspended: false } as const;

const csv = (value?: string) =>
  value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

type FacetKey = 'category' | 'farm' | 'state' | 'price' | 'rating' | 'inStock' | 'onSale' | 'featured';

interface RankedProduct {
  id: string;
  createdAt: Date;
  categorySlug: string;
  categoryName: string;
  vendorId: string;
  vendorName: string;
  state: string | null;
  fromPriceCents: number;
  inStock: boolean;
  onSale: boolean;
  featuredRank: number | null;
  ratingAverage: number;
  ratingCount: number;
  sold: number;
}

/**
 * Read-only queries behind the public storefront: the filterable catalog,
 * search suggestions, the farm directory and homepage figures. Everything
 * here only ever exposes active products from approved, unsuspended farms.
 */
@Injectable()
export class StorefrontService {
  constructor(private prisma: PrismaService) {}

  private activeFeaturedPromotion(type: PromotionType, now: Date): Prisma.PromotionWhereInput {
    return { type, status: 'ACTIVE', startDate: { lte: now }, endDate: { gte: now } };
  }

  // ───── Catalog ─────

  /**
   * Candidate rows are ranked in memory: price, stock, rating and sales are
   * all derived across variants, reviews and order lines, which does not map
   * onto a single Prisma orderBy. Only lightweight columns are loaded for the
   * ranking pass; full card data is fetched for the requested page alone.
   */
  async catalog(query: CatalogQueryDto) {
    const now = new Date();
    const q = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      vendor: publicVendor,
      variants: { some: { isActive: true } },
      ...(query.exclude && { id: { not: query.exclude } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { category: { name: { contains: q, mode: 'insensitive' } } },
          { vendor: { storeName: { contains: q, mode: 'insensitive' } } },
        ],
      }),
    };

    const candidates = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        stockAmount: true,
        discountName: true,
        discountCents: true,
        discountEndsAt: true,
        category: { select: { slug: true, name: true } },
        vendor: { select: { id: true, storeName: true, state: true } },
        variants: { where: { isActive: true }, select: { unitAmount: true, priceCents: true } },
      },
    });
    const ids = candidates.map((c) => c.id);

    const [ratings, sales, promotions] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['productId'],
        where: { productId: { in: ids } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { productId: { in: ids }, vendorOrder: { status: { in: SOLD_STATUSES } } },
        _sum: { quantity: true },
      }),
      this.prisma.promotion.findMany({
        where: {
          ...this.activeFeaturedPromotion(PromotionType.FEATURED_PRODUCT, now),
          productId: { in: ids },
        },
        select: { productId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const ratingById = new Map(ratings.map((r) => [r.productId!, r]));
    const soldById = new Map(sales.map((s) => [s.productId, s._sum.quantity ?? 0]));
    const featuredRank = new Map<string, number>();
    for (const promo of promotions) {
      if (promo.productId && !featuredRank.has(promo.productId)) {
        featuredRank.set(promo.productId, featuredRank.size);
      }
    }

    const rows: RankedProduct[] = candidates.map((c) => {
      const rating = ratingById.get(c.id);
      return {
        id: c.id,
        createdAt: c.createdAt,
        categorySlug: c.category.slug,
        categoryName: c.category.name,
        vendorId: c.vendor.id,
        vendorName: c.vendor.storeName,
        state: c.vendor.state,
        fromPriceCents: Math.min(...c.variants.map((v) => effectivePriceCents(c, v, now))),
        inStock: c.variants.some((v) => Math.floor(c.stockAmount / v.unitAmount) >= 1),
        onSale: hasActiveDiscount(c, now),
        featuredRank: featuredRank.get(c.id) ?? null,
        ratingAverage: rating?._avg.rating ?? 0,
        ratingCount: rating?._count._all ?? 0,
        sold: soldById.get(c.id) ?? 0,
      };
    });

    const categories = new Set(csv(query.category));
    const farms = new Set(csv(query.farm));
    const states = new Set(csv(query.state).map((s) => s.toUpperCase()));

    // Each facet's counts ignore that facet's own selection, so picking one
    // category still shows how many products the other categories hold.
    const matches = (row: RankedProduct, except?: FacetKey) =>
      (except === 'category' || !categories.size || categories.has(row.categorySlug)) &&
      (except === 'farm' || !farms.size || farms.has(row.vendorId)) &&
      (except === 'state' || !states.size || (row.state !== null && states.has(row.state))) &&
      (except === 'price' ||
        ((query.minPrice === undefined || row.fromPriceCents >= query.minPrice) &&
          (query.maxPrice === undefined || row.fromPriceCents <= query.maxPrice))) &&
      (except === 'rating' || !query.rating || (row.ratingCount > 0 && row.ratingAverage >= query.rating)) &&
      (except === 'inStock' || !query.inStock || row.inStock) &&
      (except === 'onSale' || !query.onSale || row.onSale) &&
      (except === 'featured' || !query.featured || row.featuredRank !== null);

    const filtered = rows.filter((row) => matches(row));
    this.sortCatalog(filtered, query.sort ?? 'recommended', rows);

    const pageSize = query.pageSize ?? 24;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(query.page ?? 1, totalPages);
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: await this.hydrate(pageRows),
      total: filtered.length,
      page,
      pageSize,
      totalPages,
      facets: this.facets(rows, matches),
    };
  }

  private sortCatalog(rows: RankedProduct[], sort: CatalogSort, all: RankedProduct[]) {
    const newest = (a: RankedProduct, b: RankedProduct) => b.createdAt.getTime() - a.createdAt.getTime();
    const rated = all.filter((r) => r.ratingCount > 0);
    const mean = rated.length
      ? rated.reduce((s, r) => s + r.ratingAverage * r.ratingCount, 0) /
        rated.reduce((s, r) => s + r.ratingCount, 0)
      : 0;
    const weighted = (r: RankedProduct) =>
      r.ratingCount
        ? (r.ratingAverage * r.ratingCount + mean * RATING_PRIOR_WEIGHT) / (r.ratingCount + RATING_PRIOR_WEIGHT)
        : -1;

    const comparators: Record<CatalogSort, (a: RankedProduct, b: RankedProduct) => number> = {
      // In-stock first, then active featured listings (most recent promotion
      // first, matching the homepage), then proven sellers and ratings.
      recommended: (a, b) =>
        Number(b.inStock) - Number(a.inStock) ||
        (a.featuredRank ?? Infinity) - (b.featuredRank ?? Infinity) ||
        b.sold - a.sold ||
        weighted(b) - weighted(a) ||
        newest(a, b),
      newest,
      'price-asc': (a, b) => a.fromPriceCents - b.fromPriceCents || newest(a, b),
      'price-desc': (a, b) => b.fromPriceCents - a.fromPriceCents || newest(a, b),
      'best-selling': (a, b) => b.sold - a.sold || weighted(b) - weighted(a) || newest(a, b),
      'top-rated': (a, b) => weighted(b) - weighted(a) || b.ratingCount - a.ratingCount || newest(a, b),
    };
    rows.sort(comparators[sort]);
  }

  private facets(rows: RankedProduct[], matches: (row: RankedProduct, except?: FacetKey) => boolean) {
    const count = <K extends string>(except: FacetKey, key: (r: RankedProduct) => K | null) => {
      const counts = new Map<K, number>();
      for (const row of rows) {
        const k = key(row);
        if (k !== null && matches(row, except)) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return counts;
    };

    const categoryNames = new Map(rows.map((r) => [r.categorySlug, r.categoryName]));
    const vendorNames = new Map(rows.map((r) => [r.vendorId, r.vendorName]));
    const priced = rows.filter((r) => matches(r, 'price')).map((r) => r.fromPriceCents);
    const total = (except: FacetKey, test: (r: RankedProduct) => boolean) =>
      rows.filter((r) => matches(r, except) && test(r)).length;

    return {
      categories: [...count('category', (r) => r.categorySlug)]
        .map(([slug, n]) => ({ slug, name: categoryNames.get(slug)!, count: n }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      farms: [...count('farm', (r) => r.vendorId)]
        .map(([id, n]) => ({ id, storeName: vendorNames.get(id)!, count: n }))
        .sort((a, b) => a.storeName.localeCompare(b.storeName)),
      states: [...count('state', (r) => r.state)]
        .map(([code, n]) => ({ code, count: n }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      price: priced.length ? { min: Math.min(...priced), max: Math.max(...priced) } : null,
      rating: {
        4: total('rating', (r) => r.ratingCount > 0 && r.ratingAverage >= 4),
        3: total('rating', (r) => r.ratingCount > 0 && r.ratingAverage >= 3),
      },
      inStock: total('inStock', (r) => r.inStock),
      onSale: total('onSale', (r) => r.onSale),
      featured: total('featured', (r) => r.featuredRank !== null),
    };
  }

  private async hydrate(rows: RankedProduct[]) {
    if (!rows.length) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        name: true,
        slug: true,
        baseUnit: true,
        stockAmount: true,
        discountName: true,
        discountCents: true,
        discountEndsAt: true,
        createdAt: true,
        category: { select: { id: true, name: true, slug: true } },
        vendor: { select: { id: true, storeName: true, location: true, state: true } },
        images: { select: { id: true, url: true } },
        variants: {
          where: { isActive: true },
          select: { id: true, label: true, unitAmount: true, priceCents: true, isActive: true },
          orderBy: { priceCents: 'asc' },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return rows
      .filter((r) => byId.has(r.id))
      .map((r) => ({
        ...byId.get(r.id)!,
        fromPriceCents: r.fromPriceCents,
        inStock: r.inStock,
        isFeatured: r.featuredRank !== null,
        rating: { average: r.ratingAverage, count: r.ratingCount },
      }));
  }

  // ───── Search suggestions ─────

  async suggest(raw: string) {
    const q = raw.trim();
    if (q.length < 2) return { products: [], farms: [], categories: [] };
    const contains = { contains: q, mode: 'insensitive' } as const;

    const [products, farms, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          vendor: publicVendor,
          variants: { some: { isActive: true } },
          OR: [{ name: contains }, { category: { name: contains } }, { vendor: { storeName: contains } }],
        },
        select: {
          id: true,
          name: true,
          discountName: true,
          discountCents: true,
          discountEndsAt: true,
          images: { select: { url: true }, take: 1 },
          category: { select: { name: true } },
          vendor: { select: { storeName: true } },
          variants: { where: { isActive: true }, select: { priceCents: true } },
        },
        take: 24,
      }),
      this.prisma.vendor.findMany({
        where: {
          ...publicVendor,
          OR: [{ storeName: contains }, { location: contains }, { description: contains }],
        },
        select: { id: true, storeName: true, location: true, state: true, photo: true },
        take: 4,
        orderBy: { storeName: 'asc' },
      }),
      this.prisma.category.findMany({
        where: { name: contains, products: { some: { isActive: true, vendor: publicVendor } } },
        select: { name: true, slug: true },
        take: 4,
        orderBy: { name: 'asc' },
      }),
    ]);

    // Names that start with the query read as the best match.
    const lower = q.toLowerCase();
    const rank = (name: string) => {
      const n = name.toLowerCase();
      return n.startsWith(lower) ? 0 : n.includes(` ${lower}`) ? 1 : n.includes(lower) ? 2 : 3;
    };
    products.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

    const now = new Date();
    return {
      products: products.slice(0, 6).map((p) => ({
        id: p.id,
        name: p.name,
        image: p.images[0]?.url ?? null,
        category: p.category.name,
        storeName: p.vendor.storeName,
        fromPriceCents: Math.min(...p.variants.map((v) => effectivePriceCents(p, v, now))),
      })),
      farms,
      categories,
    };
  }

  // ───── Farms ─────

  private async farmStats(vendorIds: string[]) {
    const [ratings, products] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['vendorId'],
        where: { vendorId: { in: vendorIds } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.product.groupBy({
        by: ['vendorId', 'categoryId'],
        where: { vendorId: { in: vendorIds }, isActive: true },
        _count: { _all: true },
      }),
    ]);
    const categoryIds = [...new Set(products.map((p) => p.categoryId))];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, slug: true },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    return (vendorId: string) => {
      const rating = ratings.find((r) => r.vendorId === vendorId);
      const own = products
        .filter((p) => p.vendorId === vendorId)
        .sort((a, b) => b._count._all - a._count._all);
      return {
        rating: { average: rating?._avg.rating ?? 0, count: rating?._count._all ?? 0 },
        productCount: own.reduce((s, p) => s + p._count._all, 0),
        categories: own.map((p) => ({ ...categoryById.get(p.categoryId)!, count: p._count._all })),
      };
    };
  }

  async farms(query: FarmsQueryDto) {
    const now = new Date();
    const q = query.q?.trim();
    const states = csv(query.state).map((s) => s.toUpperCase());
    const base: Prisma.VendorWhereInput = {
      ...publicVendor,
      ...(q && {
        OR: [
          { storeName: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const vendors = await this.prisma.vendor.findMany({
      where: base,
      select: {
        id: true,
        storeName: true,
        description: true,
        photo: true,
        coverPhoto: true,
        location: true,
        state: true,
        createdAt: true,
      },
    });
    const [stats, promotions] = await Promise.all([
      this.farmStats(vendors.map((v) => v.id)),
      this.prisma.promotion.findMany({
        where: this.activeFeaturedPromotion(PromotionType.FEATURED_VENDOR, now),
        select: { vendorId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const featuredRank = new Map<string, number>();
    for (const p of promotions) if (!featuredRank.has(p.vendorId)) featuredRank.set(p.vendorId, featuredRank.size);

    const all = vendors.map((v) => ({ ...v, ...stats(v.id), isFeatured: featuredRank.has(v.id) }));
    const stateCounts = new Map<string, number>();
    for (const v of all) if (v.state) stateCounts.set(v.state, (stateCounts.get(v.state) ?? 0) + 1);

    const items = states.length ? all.filter((v) => v.state && states.includes(v.state)) : all;
    const byRating = (a: (typeof all)[number], b: (typeof all)[number]) =>
      b.rating.average - a.rating.average || b.rating.count - a.rating.count;
    const sorts: Record<string, (a: (typeof all)[number], b: (typeof all)[number]) => number> = {
      recommended: (a, b) =>
        (featuredRank.get(a.id) ?? Infinity) - (featuredRank.get(b.id) ?? Infinity) ||
        Number(b.productCount > 0) - Number(a.productCount > 0) ||
        b.rating.count - a.rating.count ||
        byRating(a, b),
      'top-rated': byRating,
      products: (a, b) => b.productCount - a.productCount,
      newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      name: (a, b) => a.storeName.localeCompare(b.storeName),
    };
    items.sort(sorts[query.sort ?? 'recommended']);

    return {
      items,
      total: items.length,
      states: [...stateCounts].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  async farm(id: string) {
    const now = new Date();
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, ...publicVendor },
      select: {
        id: true,
        storeName: true,
        description: true,
        photo: true,
        coverPhoto: true,
        location: true,
        state: true,
        phone: true,
        createdAt: true,
      },
    });
    if (!vendor) throw new NotFoundException('Farm not found');

    const [stats, distribution, featured] = await Promise.all([
      this.farmStats([vendor.id]),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { vendorId: vendor.id },
        _count: { _all: true },
      }),
      this.prisma.promotion.count({
        where: { ...this.activeFeaturedPromotion(PromotionType.FEATURED_VENDOR, now), vendorId: vendor.id },
      }),
    ]);
    const ratingDistribution = Object.fromEntries(
      [5, 4, 3, 2, 1].map((star) => [star, distribution.find((d) => d.rating === star)?._count._all ?? 0]),
    );

    return { ...vendor, ...stats(vendor.id), ratingDistribution, isFeatured: featured > 0 };
  }

  // ───── Homepage / navigation ─────

  async overview() {
    const [config, categories, farms, productCount, sales] = await Promise.all([
      this.prisma.configuration.findUnique({ where: { key: ANNOUNCEMENT_KEY } }),
      this.prisma.category.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          products: {
            where: { isActive: true, vendor: publicVendor },
            select: { id: true, stockAmount: true, images: { select: { url: true }, take: 1 } },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.vendor.findMany({ where: publicVendor, select: { state: true } }),
      this.prisma.product.count({ where: { isActive: true, vendor: publicVendor } }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { vendorOrder: { status: { in: SOLD_STATUSES } } },
        _sum: { quantity: true },
      }),
    ]);

    const sold = new Map(sales.map((s) => [s.productId, s._sum.quantity ?? 0]));
    const stateCounts = new Map<string, number>();
    for (const f of farms) if (f.state) stateCounts.set(f.state, (stateCounts.get(f.state) ?? 0) + 1);

    // A category's cover is the image of its best-selling, in-stock product.
    const categoryCards = categories
      .filter((c) => c.products.length > 0)
      .map((c) => {
        const cover = [...c.products]
          .filter((p) => p.images.length)
          .sort((a, b) => Number(b.stockAmount > 0) - Number(a.stockAmount > 0) || (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0))[0];
        return { id: c.id, name: c.name, slug: c.slug, productCount: c.products.length, image: cover?.images[0]?.url ?? null };
      });

    return {
      announcement: config
        ? config.value
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean)
        : DEFAULT_ANNOUNCEMENTS,
      stats: { farms: farms.length, products: productCount, states: stateCounts.size },
      categories: categoryCards,
      states: [...stateCounts].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code)),
    };
  }
}
