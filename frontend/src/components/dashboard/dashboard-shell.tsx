"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { ExternalLink, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useDashboardRange } from "@/store/use-dashboard-range"
import { useApi } from "@/lib/api"
import { adminNav, isNavItemActive, vendorNav, type NavSection } from "./nav"
import { DashboardHeader } from "./dashboard-header"

export type DashboardVariant = "vendor" | "admin"

export interface DashboardUser {
  name?: string | null
  email?: string | null
}

export function DashboardShell({
  variant,
  user,
  children,
}: {
  variant: DashboardVariant
  user: DashboardUser
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const sections = variant === "vendor" ? vendorNav : adminNav
  // Shares its cache entry with the vendor overview page's summary query.
  const { data: vendor } = useApi<{ id: string }>(variant === "vendor" ? "/analytics/vendor/summary" : null)
  const storefrontHref = vendor ? `/vendors/${vendor.id}` : null

  useEffect(() => {
    void useDashboardRange.persist.rehydrate()
  }, [])

  const sidebar = (
    <SidebarContent
      variant={variant}
      sections={sections}
      storefrontHref={storefrontHref}
      onNavigate={() => setMobileOpen(false)}
    />
  )

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        {sidebar}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Dashboard sections</SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          variant={variant}
          sections={sections}
          user={user}
          storefrontHref={storefrontHref}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

function SidebarContent({
  variant,
  sections,
  storefrontHref,
  onNavigate,
}: {
  variant: DashboardVariant
  sections: NavSection[]
  storefrontHref?: string | null
  onNavigate: () => void
}) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b pl-5 pr-12 lg:pr-5">
        <Link href="/" onClick={onNavigate} aria-label="FarmMarket home">
          <Logo variant="full" />
        </Link>
        <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {variant === "vendor" ? "Seller" : "Admin"}
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Dashboard">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(item, pathname)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {item.title}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t p-3">
        {storefrontHref && (
          <Link
            href={storefrontHref}
            target="_blank"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="size-4" />
            View storefront
          </Link>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
