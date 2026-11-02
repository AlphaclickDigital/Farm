// Response shapes of the /analytics API (backend/src/analytics). All money
// values are integer cents (AUD); dates are ISO strings; chart buckets are
// already in the reporting timezone (Australia/Sydney).

export interface Metric {
  value: number
  previous: number
  change: number | null
}

export interface RangeMeta {
  preset: string
  from: string
  to: string
  startDate: string
  endDate: string
  granularity: "hour" | "day" | "week" | "month"
  timezone: string
}

export interface Paged<T> {
  total: number
  page: number
  pageSize: number
  data: T[]
}

export interface ComparedPoint {
  bucket: string
  gross: number
  commission: number
  earnings: number
  orders: number
  items: number
  prevBucket: string | null
  prevGross: number
  prevOrders: number
  prevEarnings: number
  prevCommission: number
}

// ───── Vendor ─────

export interface VendorSummary {
  id: string
  storeName: string
  ownerName: string | null
  photo: string | null
  location: string | null
  state: string | null
  status: "approved" | "pending" | "suspended"
  suspendedReason: string | null
  productCount: number
  stripe: { connected: boolean; ready: boolean; detailsSubmitted: boolean }
  balances: VendorBalances & { minPayoutCents: number }
}

export interface VendorBalances {
  pending: number
  available: number
  lifetimeEarnings: number
  inPayout: number
  paidOut: number
  payoutsCompleted: number
  payoutsOpen: number
}

export interface VendorKpis {
  range: RangeMeta
  kpis: {
    grossSales: Metric & { spark: number[] }
    orders: Metric & { spark: number[] }
    netEarnings: Metric & { spark: number[] }
    aov: Metric & { spark: number[] }
    itemsSold: Metric & { spark: number[] }
    conversionRate: {
      value: number | null
      previous: number | null
      change: number | null
      views: number
      trackingSince: string | null
      /** Set when view tracking began part-way through the period. */
      measuredFrom: string | null
    }
  }
  customers: number
}

export interface SalesSeries {
  range: RangeMeta
  points: ComparedPoint[]
}

export interface ProductSales {
  productId: string
  name: string
  baseUnit: string
  storeName: string
  category: string
  items: number
  revenue: number
  baseUnits: number
  orders: number
}

export interface CategorySales {
  categoryId: string
  name: string
  items: number
  revenue: number
  orders: number
}

export interface StatusCount {
  status: string
  count: number
  gross: number
}

export interface VendorBreakdown {
  range: RangeMeta
  totalRevenue: number
  byProduct: ProductSales[]
  byCategory: CategorySales[]
  contribution: { productId: string; name: string; revenue: number; share: number }[]
  statuses: StatusCount[]
  best: ProductSales[]
  lowest: { productId: string; name: string; revenue: number; itemsSold: number; stockState: string }[]
}

export interface VendorOrderRow {
  id: string
  orderId: string
  status: string
  createdAt: string
  customer: { name: string | null; email: string }
  destination: string | null
  items: { name: string; variant: string | null; quantity: number }[]
  itemCount: number
  subtotalCents: number
  shippingCents: number
  commissionCents: number
  payoutCents: number
  shippingMethod: string | null
  isPickup: boolean
  trackingNumber: string | null
  refundedAt: string | null
  payoutState: string
}

export interface VendorOrderList extends Paged<VendorOrderRow> {
  statusCounts: Record<string, number>
}

export interface OrderInsights {
  statuses: StatusCount[]
  pipeline: { toFulfil: number; awaitingPickup: number; shipped: number; overdue: number }
  recent: VendorOrderRow[]
}

export interface InventoryRow {
  productId: string
  name: string
  image: string | null
  category: string
  baseUnit: string
  isActive: boolean
  stockAmount: number
  smallestVariant: { label: string; unitAmount: number } | null
  sellableUnits: number
  state: "in_stock" | "low" | "out" | "inactive"
  sold30dBaseUnits: number
  sold30dItems: number
  sold7dItems: number
  dailyVelocity: number
  daysOfCover: number | null
  lastSoldAt: string | null
  noRecentSales: boolean
  highDemand: boolean
}

export interface InventoryReport {
  thresholds: { lowSellableUnits: number; lowCoverDays: number }
  summary: {
    totalProducts: number
    activeProducts: number
    inStock: number
    lowStock: number
    outOfStock: number
    inactive: number
    noRecentSales: number
    highDemand: number
  }
  rows: InventoryRow[]
}

export interface ProductPerformanceRow {
  productId: string
  name: string
  image: string | null
  category: string
  baseUnit: string
  isActive: boolean
  itemsSold: number
  orders: number
  revenue: number
  revenueShare: number
  previousRevenue: number
  trend: number | null
  stockAmount: number
  sellableUnits: number
  smallestVariant: { label: string; unitAmount: number } | null
  stockState: InventoryRow["state"]
  views: number
  conversionRate: number | null
}

export interface ProductPerformance extends Paged<ProductPerformanceRow> {
  viewTrackingSince: string | null
}

export interface VendorFinance {
  range: RangeMeta
  breakdown: {
    grossSales: Metric
    commission: Metric
    shipping: Metric
    netEarnings: Metric
    refunds: Metric & { count: number }
    effectiveCommissionRate: number
    processingFees: null
  }
  balances: VendorBalances & { minPayoutCents: number }
  stripe: { connected: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }
  series: { bucket: string; earnings: number; commission: number; gross: number; prevEarnings: number }[]
}

export interface LedgerRow {
  type: "SALE" | "REFUND" | "PAYOUT"
  id: string
  date: string
  reference: string | null
  gross: number
  commission: number
  shipping: number
  net: number
  status: string
  payoutId: string | null
  counterparty: string | null
}

export interface CustomerRow {
  userId: string
  name: string | null
  email: string | null
  orders: number
  spend: number
  firstOrderAt: string
  lastOrderAt: string
}

export interface VendorCustomers {
  totalCustomers: number
  customers: Metric
  newCustomers: Metric
  returningCustomers: Metric
  avgSpend: Metric
  repeatRate: number
  lifetimeValue: number
  orderFrequency: { label: string; count: number }[]
  series: { bucket: string; newBuyers: number; returningBuyers: number }[]
  topCustomers: CustomerRow[]
  recentActivity: {
    vendorOrderId: string
    customerName: string
    amount: number
    status: string
    date: string
    isFirstOrder: boolean
  }[]
}

export interface ReviewItem {
  id: string
  rating: number
  comment: string | null
  customerName: string
  product: { id: string; name: string } | null
  createdAt: string
  vendorReply: string | null
  vendorRepliedAt: string | null
}

export interface VendorReviews {
  average: number
  total: number
  unanswered: number
  inRange: { count: Metric; average: Metric }
  distribution: { stars: number; count: number }[]
  recent: ReviewItem[]
  bestRated: { productId: string; name: string; average: number; count: number; recentLow: number }[]
  needsAttention: { productId: string; name: string; average: number; count: number; recentLow: number }[]
}

// ───── Admin ─────

export interface AdminKpis {
  range: RangeMeta
  kpis: {
    gmv: Metric & { spark: number[] }
    platformRevenue: Metric & { spark: number[]; commission: number; promotions: number }
    orders: Metric & { spark: number[] }
    vendors: Metric & { added: number }
    activeVendors: Metric
    customers: Metric & { added: number }
    products: Metric & { added: number }
    activePromotions: Metric
  }
  series: { bucket: string; gmv: number; platformRevenue: number; orders: number; prevGmv: number }[]
}

export interface RevenueReport {
  range: RangeMeta
  gmv: Metric
  commission: Metric
  promotionRevenue: Metric & { count: number }
  platformRevenue: Metric
  refunds: Metric & { count: number }
  orders: Metric
  aov: Metric
  shippingPassThrough: Metric
  vendorEarnings: Metric
  takeRate: { effective: number; commissionEffective: number; configured: number | null }
  sources: { source: string; label: string; amount: number }[]
  series: {
    bucket: string
    gmv: number
    commission: number
    promotions: number
    platformRevenue: number
    orders: number
    prevGmv: number
    prevPlatformRevenue: number
    prevOrders: number
  }[]
  monthly: { month: string; gmv: number; commission: number; promotions: number; platformRevenue: number }[]
}

export interface FinanceReport {
  range: RangeMeta
  gmv: number
  commission: number
  promotionRevenue: number
  platformRevenue: number
  refunds: { count: number; amount: number; commission: number }
  stripe: {
    chargedOrders: number
    chargedOrdersCount: number
    chargedPromotions: number
    refunded: number
    transferredToVendors: number
    transfersCount: number
  }
  payouts: {
    completedInRange: number
    completedCount: number
    pending: number
    pendingCount: number
    failed: number
    failedCount: number
  }
  owedToVendors: { available: number; pending: number }
  failedPayments: { count: number; amount: number }
  disputes: { count: number; amount: number; open: number }
}

export interface TransactionRow {
  type: "CHARGE" | "REFUND" | "PAYOUT" | "PROMOTION" | "INCIDENT"
  id: string
  date: string
  reference: string | null
  amount: number
  status: string
  party: string | null
}

export interface VendorOverviewReport {
  range: RangeMeta
  counts: {
    total: number
    approved: number
    pending: number
    suspended: number
    activeSelling: number
    noSalesInRange: number
    neverSold: number
    newVendors: Metric
  }
  stripe: { ready: number; incomplete: number; none: number }
  newSeries: { bucket: string; registrations: number }[]
  byState: { state: string; count: number }[]
}

export interface LeaderboardRow {
  id: string
  storeName: string
  location: string | null
  state: string | null
  status: "approved" | "pending" | "suspended"
  createdAt: string
  stripe: "ready" | "incomplete" | "none"
  orders: number
  gmv: number
  commission: number
  aov: number
  prevGmv: number
  trend: number | null
  rating: number | null
  reviews: number
  products: number
}

export interface AdminProducts {
  range: RangeMeta
  counts: { total: number; active: number; listed: number; newInRange: number }
  stock: { active: number; low: number; out: number }
  topProducts: ProductSales[]
  lowestProducts: { productId: string; name: string; storeName: string; revenue: number; items: number }[]
  categorySales: CategorySales[]
  categoryDistribution: { categoryId: string; name: string; products: number; active: number }[]
}

export interface AdminOrdersOverview {
  range: RangeMeta
  statuses: { status: string; count: number; amount: number }[]
  totalPlaced: number
  abandonedCheckouts: number
  orders: Metric
  aov: Metric
  cancellationRate: number
  refundRate: number
  series: { bucket: string; orders: number; prevOrders: number; gmv: number }[]
  byState: { state: string; gross: number; orders: number; customers: number }[]
  multiVendor: { vendors: number; label: string; orders: number; gmv: number }[]
}

export interface AdminOrderRow {
  id: string
  createdAt: string
  status: string
  totalAmountCents: number
  shippingCents: number
  shippingState: string | null
  shippingCity: string | null
  stripePaymentId: string
  user: { id: string; name: string | null; email: string }
  vendorOrders: {
    id: string
    status: string
    subtotalCents: number
    commissionCents: number
    payoutCents: number
    shippingCents: number
    refundedAt: string | null
    payoutId: string | null
    vendor: { id: string; storeName: string }
  }[]
  commissionCents: number
  merchandiseCents: number
}

export interface AdminOrderList extends Paged<AdminOrderRow> {
  statusCounts: Record<string, number>
}

export interface AdminOrderDetail {
  id: string
  createdAt: string
  status: string
  totalAmountCents: number
  shippingCents: number
  stripePaymentId: string
  shippingName: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingState: string | null
  shippingZip: string | null
  shippingPhone: string | null
  user: { id: string; name: string | null; email: string; createdAt: string }
  customerPreviousOrders: number
  vendorOrders: {
    id: string
    status: string
    subtotalCents: number
    commissionCents: number
    payoutCents: number
    shippingCents: number
    shippingMethod: string | null
    trackingNumber: string | null
    trackingUrl: string | null
    stripeRefundId: string | null
    refundedAt: string | null
    payout: { id: string; status: string; completedAt: string | null; stripeTransferId: string | null } | null
    vendor: { id: string; storeName: string; state: string | null }
    items: {
      id: string
      quantity: number
      priceCents: number
      product: { id: string; name: string; images: { url: string }[] }
      variant: { label: string } | null
    }[]
  }[]
}

export interface AdminCustomers {
  registeredCustomers: number
  newRegistrations: Metric
  buyers: Metric
  newBuyers: Metric
  returningBuyers: Metric
  avgSpend: Metric
  totalBuyers: number
  repeatRate: number
  lifetimeValue: number
  orderFrequency: { label: string; count: number }[]
  series: { bucket: string; newBuyers: number; returningBuyers: number; registrations: number }[]
  topCustomers: CustomerRow[]
}

export interface PromotionRow {
  id: string
  type: "FEATURED_PRODUCT" | "FEATURED_VENDOR"
  status: string
  state: "active" | "scheduled" | "expired" | "cancelled"
  startDate: string
  endDate: string
  priceCents: number
  stripePaymentId: string
  createdAt: string
  vendor: { id: string; storeName: string }
  product: { id: string; name: string } | null
  salesDuring: number | null
  salesBefore: number | null
}

export interface PromotionsOverview {
  range: RangeMeta
  counts: { active: number; expired: number; cancelled: number }
  revenue: Metric & { count: number }
  purchases: Metric
  byType: { type: string; count: number; revenue: number }[]
  series: { bucket: string; revenue: number; purchases: number }[]
  mostPromoted: { productId: string; name: string; storeName: string; promotions: number; spend: number }[]
  spendByVendor: { vendorId: string; storeName: string; promotions: number; spend: number }[]
  expiringSoon: { id: string; endDate: string; type: string; vendor: { storeName: string }; product: { name: string } | null }[]
}

export interface GeographyReport {
  range: RangeMeta
  states: {
    state: string
    orders: number
    gmv: number
    gmvShare: number
    vendors: number
    vendorGmv: number
    vendorOrders: number
    buyers: number
  }[]
  topRegion: string | null
}

export interface ActivityItem {
  id: string
  kind: string
  title: string
  description?: string
  date: string
  href?: string
  actor?: string | null
}

export interface AuditEntry {
  id: string
  action: string
  summary: string
  entityType: string | null
  entityId: string | null
  actorRole: string | null
  createdAt: string
  actor: { id: string; name: string | null; email: string } | null
}
