"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { ChevronRight, LogOut, Megaphone, Menu, Plus, Settings, Store, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { findActiveNav, type NavSection } from "./nav"
import { CommandSearch } from "./command-search"
import { NotificationBell } from "./notification-bell"
import type { DashboardUser, DashboardVariant } from "./dashboard-shell"

const SEGMENT_LABELS: Record<string, string> = { new: "New", edit: "Edit" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function useBreadcrumbs(sections: NavSection[], rootHref: string) {
  const pathname = usePathname()
  const active = findActiveNav(sections, pathname)
  const crumbs: { label: string; href?: string }[] = []
  if (!active) return crumbs
  if (active.item.href !== rootHref) crumbs.push({ label: active.section.title })
  crumbs.push({ label: active.item.title, href: active.item.href })
  const rest = pathname.slice(active.item.href.length).split("/").filter(Boolean)
  let href = active.item.href
  for (const segment of rest) {
    href += `/${segment}`
    crumbs.push({ label: SEGMENT_LABELS[segment] ?? (UUID.test(segment) ? "Details" : segment), href })
  }
  return crumbs
}

export function DashboardHeader({
  variant,
  sections,
  user,
  storefrontHref,
  onOpenMenu,
}: {
  variant: DashboardVariant
  sections: NavSection[]
  user: DashboardUser
  storefrontHref?: string | null
  onOpenMenu: () => void
}) {
  const rootHref = variant === "vendor" ? "/vendor/dashboard" : "/admin"
  const crumbs = useBreadcrumbs(sections, rootHref)
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu />
      </Button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
              {crumb.href && !last ? (
                <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className={last ? "truncate font-medium text-foreground" : "truncate text-muted-foreground"}>
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <CommandSearch sections={sections} variant={variant} />
        <span className="hidden whitespace-nowrap px-2 text-xs text-muted-foreground xl:inline">{today}</span>

        {variant === "vendor" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus />
                <span className="hidden sm:inline">Create</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/vendor/dashboard/products/new">
                  <Plus /> Add product
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/vendor/dashboard/promotions">
                  <Megaphone /> Create promotion
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <NotificationBell variant={variant} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary outline-none ring-offset-background transition hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Account menu"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{user.name || "Account"}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={variant === "vendor" ? "/vendor/dashboard/settings" : "/admin/settings"}>
                <Settings /> {variant === "vendor" ? "Store settings" : "Platform settings"}
              </Link>
            </DropdownMenuItem>
            {storefrontHref && (
              <DropdownMenuItem asChild>
                <Link href={storefrontHref} target="_blank">
                  <ExternalLink /> View storefront
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/">
                <Store /> Back to marketplace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => signOut({ callbackUrl: "/login" })}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
