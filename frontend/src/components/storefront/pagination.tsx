import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

function pageList(page: number, total: number): (number | "gap")[] {
  const pages = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total))
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | "gap")[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap")
    out.push(p)
  })
  return out
}

/** Plain links (crawlable, work without JS) that keep the current filters. */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
  anchor,
}: {
  page: number
  totalPages: number
  basePath: string
  params: Record<string, string | undefined>
  anchor?: string
}) {
  if (totalPages <= 1) return null

  const href = (p: number) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value && key !== "page") search.set(key, value)
    if (p > 1) search.set("page", String(p))
    const query = search.toString().replace(/%2C/g, ",")
    return `${basePath}${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`
  }

  const item = "flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors"

  return (
    <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} className={cn(item, "gap-1 hover:bg-secondary")} rel="prev">
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : (
        <span className={cn(item, "gap-1 text-muted-foreground/50")} aria-disabled="true">
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </span>
      )}
      {pageList(page, totalPages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(item, p === page ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
          >
            {p}
          </Link>
        )
      )}
      {page < totalPages ? (
        <Link href={href(page + 1)} className={cn(item, "gap-1 hover:bg-secondary")} rel="next">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className={cn(item, "gap-1 text-muted-foreground/50")} aria-disabled="true">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  )
}
