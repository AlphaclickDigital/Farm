import Link from "next/link"
import { auth } from "@/auth"
import { Logo } from "@/components/logo"
import { CartSheet } from "@/components/cart-sheet"
import { MobileNav } from "@/components/mobile-nav"
import { HeaderSearch } from "@/components/storefront/header-search"
import { AccountMenu, DepartmentNav, LocationSelect } from "@/components/storefront/header-parts"
import { departmentLinks, getOverview } from "@/lib/storefront"

function AnnouncementBar({ messages }: { messages: string[] }) {
  return (
    <div className="bg-forest text-forest-foreground">
      <div className="shell flex h-9 items-center justify-center gap-6 text-xs tracking-[0.01em]">
        <p className="truncate">{messages[0]}</p>
        {messages.slice(1, 3).map((message) => (
          <p key={message} className="hidden items-center gap-6 truncate lg:flex">
            <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-gold" />
            {message}
          </p>
        ))}
      </div>
    </div>
  )
}

export async function Navbar() {
  const [session, overview] = await Promise.all([auth(), getOverview()])
  const categories = overview?.categories ?? []
  const departments = departmentLinks(categories)
  const user = session?.user
    ? { name: session.user.name, email: session.user.email, role: session.user.role }
    : null
  const popular = [...categories].sort((a, b) => b.productCount - a.productCount)

  return (
    <>
      {overview && overview.announcement.length > 0 && <AnnouncementBar messages={overview.announcement} />}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="shell flex flex-wrap items-center gap-x-2 gap-y-2.5 py-2.5 md:h-[72px] md:flex-nowrap md:gap-x-6 md:py-0">
          <MobileNav user={user} departments={departments} states={overview?.states ?? []} />
          <Link href="/" aria-label="FarmMarket home" className="shrink-0">
            <Logo variant="full" />
          </Link>
          <HeaderSearch
            popular={popular}
            className="order-last basis-full md:order-none md:max-w-2xl md:flex-1 md:basis-auto"
          />
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <LocationSelect states={overview?.states ?? []} className="hidden xl:flex" />
            <AccountMenu user={user} />
            <CartSheet />
          </div>
        </div>

        <nav aria-label="Departments" className="hidden border-t border-border/60 lg:block">
          <div className="shell flex h-11 items-center gap-7 text-[13px] font-semibold">
            <DepartmentNav links={[{ label: "Shop all", href: "/products" }, ...departments]} />
            <span className="ml-auto flex h-full items-center gap-7">
              <DepartmentNav links={[{ label: "Discover farms", href: "/vendors" }]} />
              <Link
                href="/vendor/onboarding"
                className="whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
              >
                Sell on FarmMarket
              </Link>
            </span>
          </div>
        </nav>
      </header>
    </>
  )
}
