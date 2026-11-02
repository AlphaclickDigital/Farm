import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CreditCard,
  LayoutDashboard,
  Map,
  Megaphone,
  MessageSquareText,
  Package,
  PiggyBank,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  TrendingUp,
  Users,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  /** Only active on an exact path match (used for section roots). */
  exact?: boolean
  /** Extra words the ⌘K search should match. */
  keywords?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const vendorNav: NavSection[] = [
  {
    title: "Overview",
    items: [{ title: "Dashboard", href: "/vendor/dashboard", icon: LayoutDashboard, exact: true, keywords: "home overview" }],
  },
  {
    title: "Store",
    items: [
      { title: "Products", href: "/vendor/dashboard/products", icon: Package, keywords: "catalogue listings add" },
      { title: "Inventory", href: "/vendor/dashboard/inventory", icon: Boxes, keywords: "stock restock low out" },
      { title: "Orders", href: "/vendor/dashboard/orders", icon: ShoppingCart, keywords: "fulfil ship tracking" },
      { title: "Customers", href: "/vendor/dashboard/customers", icon: Users, keywords: "buyers repeat" },
      { title: "Reviews", href: "/vendor/dashboard/reviews", icon: MessageSquareText, keywords: "ratings reply" },
      { title: "Shipping", href: "/vendor/dashboard/shipping", icon: Truck, keywords: "delivery pickup rates" },
    ],
  },
  {
    title: "Growth",
    items: [
      { title: "Analytics", href: "/vendor/dashboard/analytics", icon: BarChart3, keywords: "sales performance reports" },
      { title: "Promotions", href: "/vendor/dashboard/promotions", icon: Megaphone, keywords: "featured advertising" },
    ],
  },
  {
    title: "Finance",
    items: [
      { title: "Earnings", href: "/vendor/dashboard/earnings", icon: PiggyBank, keywords: "revenue transactions commission" },
      { title: "Payouts", href: "/vendor/dashboard/payouts", icon: Wallet, keywords: "stripe bank transfer" },
    ],
  },
  {
    title: "Account",
    items: [
      { title: "Store settings", href: "/vendor/dashboard/settings", icon: Settings, keywords: "profile photo" },
      { title: "Notifications", href: "/vendor/dashboard/notifications", icon: Bell, keywords: "alerts" },
    ],
  },
]

export const adminNav: NavSection[] = [
  {
    title: "Overview",
    items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true, keywords: "home overview" }],
  },
  {
    title: "Marketplace",
    items: [
      { title: "Vendors", href: "/admin/vendors", icon: Store, keywords: "farms applications approve suspend" },
      { title: "Orders", href: "/admin/orders", icon: ShoppingCart, keywords: "refund" },
      { title: "Categories", href: "/admin/categories", icon: Tag },
      { title: "Users", href: "/admin/users", icon: UserRound, keywords: "accounts customers" },
    ],
  },
  {
    title: "Insights",
    items: [
      { title: "Revenue & finance", href: "/admin/analytics/revenue", icon: TrendingUp, keywords: "gmv commission transactions disputes" },
      { title: "Vendor performance", href: "/admin/analytics/vendors", icon: BarChart3, keywords: "leaderboard" },
      { title: "Products", href: "/admin/analytics/products", icon: Package, keywords: "categories stock" },
      { title: "Customers", href: "/admin/analytics/customers", icon: Users, keywords: "retention buyers" },
      { title: "Geography", href: "/admin/analytics/geography", icon: Map, keywords: "states regions" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { title: "Promotions", href: "/admin/promotions", icon: Megaphone, keywords: "featured advertising listings" },
      { title: "Payouts", href: "/admin/payouts", icon: CreditCard, keywords: "transfers stripe" },
    ],
  },
  {
    title: "System",
    items: [
      { title: "Activity log", href: "/admin/activity", icon: Activity, keywords: "audit history" },
      { title: "Notifications", href: "/admin/notifications", icon: Bell, keywords: "alerts" },
      { title: "Settings", href: "/admin/settings", icon: Settings, keywords: "commission configuration pricing" },
    ],
  },
]

export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** The nav item and section that own the current path (longest match wins). */
export function findActiveNav(sections: NavSection[], pathname: string) {
  let best: { item: NavItem; section: NavSection } | null = null
  for (const section of sections) {
    for (const item of section.items) {
      if (isNavItemActive(item, pathname) && (!best || item.href.length > best.item.href.length)) {
        best = { item, section }
      }
    }
  }
  return best
}
