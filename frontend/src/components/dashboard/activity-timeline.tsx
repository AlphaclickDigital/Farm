import Link from "next/link"
import { formatRelative } from "@/lib/format"
import type { ActivityItem } from "@/lib/dashboard-types"

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  return (
    <ol className="relative space-y-4 border-l pl-4">
      {items.map((item) => {
        const body = (
          <>
            <p className="text-sm leading-snug text-foreground">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[item.description, item.actor && `by ${item.actor}`, formatRelative(item.date)].filter(Boolean).join(" · ")}
            </p>
          </>
        )
        return (
          <li key={item.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 size-2 rounded-full border-2 border-card bg-primary/60" aria-hidden />
            {item.href ? (
              <Link href={item.href} className="block hover:opacity-80">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ol>
  )
}
