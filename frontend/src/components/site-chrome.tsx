"use client"

import { usePathname } from "next/navigation"

const DASHBOARD_PREFIXES = ["/admin", "/vendor/dashboard"]
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"]

/**
 * Storefront navbar and footer wrap every public page. The vendor and admin
 * dashboards have their own shell, and the sign-in pages use the focused
 * AuthLayout, so the storefront chrome is dropped there.
 */
export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode
  footer: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isDashboard = DASHBOARD_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (isDashboard || AUTH_PAGES.includes(pathname)) return <>{children}</>
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      {header}
      <main id="main-content" className="min-h-[60vh]">
        {children}
      </main>
      {footer}
    </>
  )
}
