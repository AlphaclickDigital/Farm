"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Check, LayoutDashboard, LogOut, Package, User } from "lucide-react"
import { dashboardFor } from "@/components/storefront/header-parts"
import { cn } from "@/lib/utils"

// ───── Order status ─────

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-secondary text-secondary-foreground" },
  PAID: { label: "Paid", className: "bg-info/10 text-info" },
  PROCESSING: { label: "Being prepared", className: "bg-gold/20 text-foreground" },
  SHIPPED: { label: "On its way", className: "bg-info/10 text-info" },
  COMPLETED: { label: "Completed", className: "bg-good/10 text-good" },
  CANCELLED: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
  REFUNDED: { label: "Refunded", className: "bg-secondary text-muted-foreground" },
}

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status, className: "bg-secondary" }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", s.className, className)}>
      {s.label}
    </span>
  )
}

const PROGRESS = ["PAID", "PROCESSING", "SHIPPED", "COMPLETED"] as const
const PROGRESS_LABELS = ["Paid", "Preparing", "Shipped", "Completed"]

/** Paid → Preparing → Shipped → Completed for one farm's part of an order. */
export function OrderProgress({ status }: { status: string }) {
  if (status === "CANCELLED" || status === "REFUNDED") return null
  const reached = PROGRESS.indexOf(status as (typeof PROGRESS)[number])
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Order progress">
      {PROGRESS_LABELS.map((label, i) => {
        const done = i <= reached
        return (
          <li key={label} aria-current={i === reached ? "step" : undefined}>
            <span className={cn("block h-1 rounded-full", done ? "bg-primary" : "bg-secondary")} />
            <span className={cn("mt-1.5 flex items-center gap-1 text-[11px]", done ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {done && i < reached && <Check className="h-3 w-3 text-primary" />}
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ───── Account layout ─────

const LINKS = [
  { href: "/account", label: "Overview", icon: User },
  { href: "/orders", label: "Orders", icon: Package },
]

export function AccountShell({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const dashboard = dashboardFor(session?.user?.role)

  return (
    <div className="shell pb-24 pt-8">
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        <aside>
          <nav aria-label="Account" className="lg:sticky lg:top-32">
            <p className="hidden truncate text-sm font-semibold lg:block">{session?.user?.name ?? "Your account"}</p>
            <p className="mb-5 hidden truncate text-xs text-muted-foreground lg:block">{session?.user?.email}</p>
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:px-0">
              {LINKS.map(({ href, label, icon: Icon }) => {
                const active = href === "/orders" ? pathname.startsWith("/orders") : pathname === href
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-sm font-semibold transition-colors",
                        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  </li>
                )
              })}
              {dashboard && (
                <li>
                  <Link
                    href={dashboard.href}
                    className="flex h-10 items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    {dashboard.label}
                  </Link>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="mb-8">
            <h1 className="font-serif text-4xl font-medium tracking-[-0.02em]">{title}</h1>
            {description && <div className="mt-2 text-muted-foreground">{description}</div>}
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
