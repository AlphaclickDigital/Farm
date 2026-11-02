"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ShelfTab {
  id: string
  label: string
  href: string
  content: React.ReactNode
}

/**
 * Tabbed product shelves. Every panel is server-rendered and kept in the DOM
 * (inactive ones are `hidden`), so all of them stay crawlable.
 */
export function ShelfTabs({ tabs }: { tabs: ShelfTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  const baseId = useId()
  const current = tabs.find((t) => t.id === active) ?? tabs[0]

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next = tabs[(index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]
    setActive(next.id)
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus()
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4 border-b">
        <div role="tablist" aria-label="Product shelves" className="-mb-px flex gap-6 overflow-x-auto scrollbar-none">
          {tabs.map((tab, i) => {
            const selected = tab.id === current.id
            return (
              <button
                key={tab.id}
                id={`${baseId}-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition-colors",
                  selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <Link
          href={current.href}
          className="group mb-3 hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline sm:inline-flex"
        >
          View all
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== current.id}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
