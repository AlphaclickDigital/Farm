"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, Menu } from "lucide-react"
import { signOut } from "next-auth/react"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Logo } from "@/components/logo"
import { dashboardFor, type HeaderUser } from "@/components/storefront/header-parts"
import { AU_STATES } from "@/lib/storefront"

interface MobileNavProps {
  user: HeaderUser | null
  departments: { label: string; href: string }[]
  states: { code: string; count: number }[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 pb-1 pt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{children}</p>
  )
}

function NavRow({ href, children, muted }: { href: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        className={`flex min-h-12 items-center justify-between px-5 text-[15px] font-semibold active:bg-secondary ${muted ? "text-muted-foreground" : ""}`}
      >
        {children}
        <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
      </Link>
    </SheetClose>
  )
}

export function MobileNav({ user, departments, states }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const dashboard = dashboardFor(user?.role)
  const counts = new Map(states.map((s) => [s.code, s.count]))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-md hover:bg-secondary lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>

      <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle asChild>
            <Link href="/" onClick={() => setOpen(false)}>
              <Logo variant="full" />
            </Link>
          </SheetTitle>
        </SheetHeader>

        <nav aria-label="Mobile" className="flex-1 pb-6">
          <SectionLabel>Shop</SectionLabel>
          <NavRow href="/products">Shop all</NavRow>
          {departments.map((d) => (
            <NavRow key={d.href} href={d.href}>
              {d.label}
            </NavRow>
          ))}

          <SectionLabel>Farms</SectionLabel>
          <NavRow href="/vendors">Discover farms</NavRow>
          <div className="grid grid-cols-4 gap-2 px-5 pt-2">
            {AU_STATES.map((s) => (
              <SheetClose asChild key={s.code}>
                <Link
                  href={`/vendors?state=${s.code}`}
                  className="flex flex-col items-center rounded-md border py-2 text-center active:bg-secondary"
                  aria-label={`Farms in ${s.name}`}
                >
                  <span className="text-sm font-bold">{s.code}</span>
                  <span className="text-[10px] text-muted-foreground">{counts.get(s.code) ?? 0} farms</span>
                </Link>
              </SheetClose>
            ))}
          </div>

          <SectionLabel>Account</SectionLabel>
          {user ? (
            <>
              <p className="truncate px-5 pb-1 text-xs text-muted-foreground">Signed in as {user.email}</p>
              <NavRow href="/account">My account</NavRow>
              <NavRow href="/orders">My orders</NavRow>
              {dashboard && <NavRow href={dashboard.href}>{dashboard.label}</NavRow>}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="flex min-h-12 w-full items-center px-5 text-[15px] font-semibold text-muted-foreground active:bg-secondary"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 px-5 pt-2">
              <SheetClose asChild>
                <Link
                  href="/login"
                  className="flex h-11 items-center justify-center rounded-md border text-sm font-semibold"
                >
                  Sign in
                </Link>
              </SheetClose>
              <SheetClose asChild>
                <Link
                  href="/register"
                  className="flex h-11 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
                >
                  Create account
                </Link>
              </SheetClose>
            </div>
          )}

          <SectionLabel>Sell</SectionLabel>
          <NavRow href="/vendor/onboarding" muted>
            Sell on FarmMarket
          </NavRow>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
