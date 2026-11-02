import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { Logo } from "@/components/logo"
import { getOverview } from "@/lib/storefront"

/**
 * Focused shell for sign-in, registration and password recovery. The
 * storefront header and footer are left out (see SiteChrome), so the page is
 * the form plus a photo panel. Panel copy only describes things the
 * marketplace does today; counts come from the live storefront overview.
 */
export type AuthPanel = "sign-in" | "register" | "recover"

interface PanelContent {
  image: string
  alt: string
  eyebrow: string
  title: string
  points: string[]
}

function panelContent(panel: AuthPanel): PanelContent {
  switch (panel) {
    case "sign-in":
      return {
        image: "/images/market-crate.jpg",
        alt: "Bunches of carrots and leeks on a market stall",
        eyebrow: "Your account",
        title: "Every farm you buy from, in one order history.",
        points: [
          "Follow each farm's part of your order, from paid to delivered",
          "Buy again at today's prices in one click",
          "Review products once your order is completed",
        ],
      }
    case "register":
      return {
        image: "/images/hero-harvest.jpg",
        alt: "Strawberries being picked into punnets on a farm",
        eyebrow: "Join FarmMarket",
        title: "Buy straight from the people who grow it.",
        points: [
          "Every product is listed and sent by the farm that grows or makes it",
          "Each farm sets its own prices, delivery and pickup options",
          "One checkout for several farms, with payment processed by Stripe",
        ],
      }
    case "recover":
      return {
        image: "/images/field-rows.jpg",
        alt: "Young crops growing in dark soil",
        eyebrow: "Account help",
        title: "Back to the market in a minute.",
        points: [
          "Reset links work for one hour after we send them",
          "Your cart stays saved on this device while you reset",
        ],
      }
  }
}

export async function AuthLayout({ panel, children }: { panel: AuthPanel; children: React.ReactNode }) {
  const overview = await getOverview()
  const content = panelContent(panel)
  const showStats = panel !== "recover" && overview !== null && overview.stats.farms > 0

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-10 lg:px-12 xl:px-16">
          <Link href="/" aria-label="FarmMarket home" className="rounded-md">
            <Logo />
          </Link>
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 rounded-md py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>
              Back <span className="hidden sm:inline">to the shop</span>
            </span>
          </Link>
        </header>

        <main id="main-content" className="flex flex-1 items-center justify-center px-5 pt-6 pb-14 sm:px-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/60 px-5 py-5 text-xs text-muted-foreground sm:px-10 lg:px-12 xl:px-16">
          <p>&copy; {new Date().getFullYear()} FarmMarket</p>
          <p>
            Need a hand?{" "}
            <a href="mailto:help@farmmarket.com" className="font-semibold text-foreground underline-offset-4 hover:underline">
              help@farmmarket.com
            </a>
          </p>
        </footer>
      </div>

      <aside aria-label="About FarmMarket" className="relative hidden bg-forest lg:block">
        <div className="sticky top-0 h-dvh overflow-hidden">
          <Image src={content.image} alt={content.alt} fill priority sizes="55vw" className="object-cover" />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-t from-forest from-15% via-forest/75 via-50% to-forest/0 to-80%"
          />
          <div className="absolute inset-x-0 bottom-0 px-12 pb-12 text-forest-foreground xl:px-16 xl:pb-16">
            <p className="text-[11px] font-bold tracking-[0.18em] text-gold uppercase">{content.eyebrow}</p>
            <p className="mt-3 max-w-lg font-serif text-4xl leading-[1.1] font-semibold tracking-[-0.01em] xl:text-[2.75rem]">
              {content.title}
            </p>
            <ul className="mt-7 max-w-md space-y-3">
              {content.points.map((point) => (
                <li key={point} className="flex gap-3 text-[15px] leading-snug text-forest-foreground/90">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-forest">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            {showStats && overview && (
              <dl className="mt-10 flex max-w-md divide-x divide-forest-foreground/20 border-t border-forest-foreground/20 pt-6">
                {[
                  { label: "Farms", value: overview.stats.farms },
                  { label: "Products", value: overview.stats.products },
                  { label: "States", value: overview.stats.states },
                ].map((stat) => (
                  <div key={stat.label} className="flex-1 px-5 first:pl-0">
                    <dt className="text-[11px] font-bold tracking-[0.16em] text-forest-foreground/65 uppercase">
                      {stat.label}
                    </dt>
                    <dd className="mt-1 font-serif text-3xl font-semibold">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
