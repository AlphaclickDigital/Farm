import Link from "next/link"
import { Lock } from "lucide-react"
import { Logo } from "@/components/logo"
import { departmentLinks, getOverview, AU_STATES } from "@/lib/storefront"

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-forest-foreground/60">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-forest-foreground/85 transition-colors hover:text-forest-foreground hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export async function Footer() {
  const overview = await getOverview()
  const departments = departmentLinks(overview?.categories ?? [])
  const statesWithFarms = AU_STATES.filter((s) => overview?.states.some((x) => x.code === s.code))

  return (
    <footer className="bg-forest text-forest-foreground">
      <div className="shell grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-4">
          <Link href="/" aria-label="FarmMarket home" className="inline-block rounded-md">
            <Logo tone="inverse" tagline iconClassName="h-10 w-10" />
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-forest-foreground/75">
            An online farmers&apos; market for Australia. Every product is listed and sent by the independent farm that
            grows or makes it.
          </p>
          {overview && (
            <p className="mt-6 text-sm text-forest-foreground/75">
              <span className="font-semibold text-forest-foreground">{overview.stats.farms}</span> farms ·{" "}
              <span className="font-semibold text-forest-foreground">{overview.stats.products}</span> products ·{" "}
              <span className="font-semibold text-forest-foreground">{overview.stats.states}</span>{" "}
              {overview.stats.states === 1 ? "state" : "states"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 md:col-span-8">
          <FooterColumn title="Shop" links={[{ href: "/products", label: "Shop all" }, ...departments]} />
          <FooterColumn
            title="Farms"
            links={[
              { href: "/vendors", label: "Discover farms" },
              ...statesWithFarms.map((s) => ({ href: `/vendors?state=${s.code}`, label: `Farms in ${s.code}` })),
            ]}
          />
          <FooterColumn
            title="Your account"
            links={[
              { href: "/account", label: "My account" },
              { href: "/orders", label: "Orders" },
              { href: "/cart", label: "Cart" },
              { href: "/register", label: "Create an account" },
            ]}
          />
          <FooterColumn
            title="Sell with us"
            links={[
              { href: "/vendor/onboarding", label: "Become a seller" },
              { href: "/vendor/dashboard", label: "Seller dashboard" },
            ]}
          />
        </div>
      </div>

      <div className="border-t border-forest-foreground/15">
        <div className="shell flex flex-col gap-3 py-6 text-xs text-forest-foreground/65 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} FarmMarket. Prices in AUD.</p>
          <p className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Payments processed securely by Stripe
          </p>
          <a href="mailto:help@farmmarket.com" className="hover:text-forest-foreground hover:underline">
            help@farmmarket.com
          </a>
        </div>
      </div>
    </footer>
  )
}
