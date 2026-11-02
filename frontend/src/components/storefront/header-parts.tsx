"use client"

import { Suspense, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { signOut } from "next-auth/react"
import { Check, ChevronDown, LayoutDashboard, LogOut, MapPin, Package, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AU_STATES, stateName } from "@/lib/storefront"
import { readStored, useStoredValue, writeStored } from "@/lib/use-local-storage"
import { cn } from "@/lib/utils"

const REGION_KEY = "farm-region"

// ───── Location ─────

interface LocationSelectProps {
  states: { code: string; count: number }[]
  className?: string
}

/**
 * "Shop farms in …": narrows the catalog to farms in one state. On the
 * catalog the URL is the source of truth; elsewhere the last choice is shown.
 */
function LocationSelectInner({ states, className, urlState }: LocationSelectProps & { urlState?: string | null }) {
  const router = useRouter()
  const stored = useStoredValue<string | null>(REGION_KEY, null)
  const region = urlState !== undefined ? urlState : stored

  // Remember what the catalog is showing, so other pages agree with it.
  useEffect(() => {
    if (urlState !== undefined && urlState !== readStored<string | null>(REGION_KEY, null)) {
      writeStored(REGION_KEY, urlState)
    }
  }, [urlState])

  function choose(code: string | null) {
    writeStored(REGION_KEY, code)
    router.push(code ? `/products?state=${code}` : "/products")
  }

  const counts = new Map(states.map((s) => [s.code, s.count]))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-11 items-center gap-2 rounded-md px-2.5 text-left outline-none transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/40",
          className
        )}
      >
        <MapPin className="h-4 w-4 text-olive" />
        <span className="leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Shop farms in
          </span>
          <span className="flex items-center gap-1 text-[13px] font-semibold">
            {region ? stateName(region) : "All of Australia"}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Show products from farms in</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => choose(null)}>
          <span className="flex-1">All of Australia</span>
          {!region && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {AU_STATES.map((s) => {
          const count = counts.get(s.code) ?? 0
          return (
            <DropdownMenuItem key={s.code} onSelect={() => choose(s.code)}>
              <span className="flex-1">{s.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {count ? `${count} ${count === 1 ? "farm" : "farms"}` : "—"}
              </span>
              {region === s.code && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UrlAwareLocationSelect(props: LocationSelectProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Only a single-state filter maps onto the selector; several read as "all".
  const param = searchParams.get("state")
  const urlState = pathname === "/products" ? (param && !param.includes(",") ? param : null) : undefined
  return <LocationSelectInner {...props} urlState={urlState} />
}

export function LocationSelect(props: LocationSelectProps) {
  return (
    <Suspense fallback={<LocationSelectInner {...props} />}>
      <UrlAwareLocationSelect {...props} />
    </Suspense>
  )
}

// ───── Account ─────

export interface HeaderUser {
  name?: string | null
  email?: string | null
  role?: string
}

export function dashboardFor(role?: string) {
  if (role === "ADMIN") return { href: "/admin", label: "Admin dashboard" }
  if (role === "VENDOR") return { href: "/vendor/dashboard", label: "Seller dashboard" }
  return null
}

export function AccountMenu({ user }: { user: HeaderUser | null }) {
  const triggerClass =
    "flex h-11 items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold outline-none transition-colors hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/40"

  if (!user) {
    return (
      <Link href="/login" className={triggerClass}>
        <User className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    )
  }

  const dashboard = dashboardFor(user.role)
  const firstName = user.name?.split(" ")[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} aria-label="Account menu">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase text-primary-foreground">
          {(user.name || user.email || "?").slice(0, 1)}
        </span>
        <span className="hidden max-w-28 truncate xl:inline">{firstName || "Account"}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 opacity-60 xl:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{user.name || "Your account"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User className="h-4 w-4" />
            My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/orders">
            <Package className="h-4 w-4" />
            My orders
          </Link>
        </DropdownMenuItem>
        {dashboard && (
          <DropdownMenuItem asChild>
            <Link href={dashboard.href}>
              <LayoutDashboard className="h-4 w-4" />
              {dashboard.label}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ───── Department navigation ─────

interface NavLink {
  label: string
  href: string
}

function DepartmentLinks({ links, current }: { links: NavLink[]; current: string | null }) {
  return (
    <>
      {links.map((link) => {
        const active = current === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-full items-center whitespace-nowrap text-foreground/80 transition-colors hover:text-primary",
              active &&
                "text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </>
  )
}

function ActiveDepartmentLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const current = pathname === "/products" ? (query ? `/products?${decodeURIComponent(query)}` : "/products") : pathname
  return <DepartmentLinks links={links} current={current} />
}

export function DepartmentNav({ links }: { links: NavLink[] }) {
  return (
    <Suspense fallback={<DepartmentLinks links={links} current={null} />}>
      <ActiveDepartmentLinks links={links} />
    </Suspense>
  )
}
