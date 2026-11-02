import NextAuth from "next-auth"
import authConfig from "./auth.config"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl
  const isAuthPage = pathname === "/login" || pathname === "/register"
  const isVendorDashboard = pathname.startsWith("/vendor/dashboard")
  const isVendorOnboarding = pathname === "/vendor/onboarding"
  const isAdminDashboard = pathname.startsWith("/admin")
  const role = req.auth?.user?.role

  // Public pages - accessible without login
  const isPublicPage =
    pathname === "/" ||
    pathname === "/products" ||
    pathname.startsWith("/products/") ||
    pathname === "/vendors" ||
    pathname.startsWith("/vendors/") ||
    pathname === "/cart" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"

  // Logged-in users shouldn't see login/register - redirect to their dashboard
  if (isLoggedIn && isAuthPage) {
    if (role === "ADMIN") return Response.redirect(new URL("/admin", req.url))
    if (role === "VENDOR") return Response.redirect(new URL("/vendor/dashboard", req.url))
    return Response.redirect(new URL("/", req.url))
  }

  // Allow public pages without login
  if (isPublicPage) {
    return
  }

  // Must be logged in for protected pages
  if (!isLoggedIn && !isAuthPage) {
    // Remember where the customer was going (e.g. checkout) for after sign-in.
    const login = new URL("/login", req.url)
    login.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`)
    return Response.redirect(login)
  }

  // Vendor dashboard requires VENDOR role
  if (isVendorDashboard && role !== "VENDOR") {
    return Response.redirect(new URL("/", req.url))
  }

  // Already a vendor? Skip onboarding
  if (isVendorOnboarding && role === "VENDOR") {
    return Response.redirect(new URL("/vendor/dashboard", req.url))
  }

  // Admin dashboard requires ADMIN role
  if (isAdminDashboard && role !== "ADMIN") {
    return Response.redirect(new URL("/", req.url))
  }
})

export const config = {
  // Static assets, app icons and crawler files are public and skip the auth check.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|images/|robots.txt|sitemap.xml).*)"],
}
