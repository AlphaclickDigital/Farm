import Link from "next/link"
import { ArrowRight, ChevronRight } from "lucide-react"
import { SITE_URL } from "@/lib/storefront"
import { cn } from "@/lib/utils"

/** Serialises structured data for search engines. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // `<` is escaped so a product name can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  )
}

export interface Crumb {
  label: string
  href?: string
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const trail = [{ label: "Home", href: "/" }, ...items]
  return (
    <>
      <nav aria-label="Breadcrumb" className={cn("text-xs text-muted-foreground", className)}>
        <ol className="flex flex-wrap items-center gap-1">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1
            return (
              <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-foreground")}>
                    {crumb.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: trail.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.label,
            ...(crumb.href && { item: `${SITE_URL}${crumb.href}` }),
          })),
        }}
      />
    </>
  )
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-bold uppercase tracking-[0.18em] text-olive", className)}>{children}</p>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  link,
  className,
  id,
}: {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  link?: { href: string; label: string }
  className?: string
  id?: string
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2 id={id} className="font-serif text-[1.75rem] font-medium leading-[1.15] tracking-[-0.015em] sm:text-4xl">
          {title}
        </h2>
        {description && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {link && (
        <Link
          href={link.href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          {link.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-card/60 px-6 py-16 text-center",
        className
      )}
    >
      {Icon && <Icon className="mb-4 h-10 w-10 text-muted-foreground/50" strokeWidth={1.25} />}
      <h2 className="font-serif text-xl font-medium">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )
}
