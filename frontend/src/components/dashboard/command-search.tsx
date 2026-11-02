"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CornerDownLeft, Search, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { NavSection } from "./nav"
import type { DashboardVariant } from "./dashboard-shell"

interface Command {
  id: string
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  href: string
}

/**
 * ⌘K / Ctrl+K quick navigation: jump to any dashboard page, or search
 * orders by number, customer, product or farm.
 */
export function CommandSearch({ sections, variant }: { sections: NavSection[]; variant: DashboardVariant }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const ordersHref = variant === "vendor" ? "/vendor/dashboard/orders" : "/admin/orders"

  const commands = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pages: Command[] = sections.flatMap((section) =>
      section.items
        .filter((item) => !q || `${item.title} ${section.title} ${item.keywords ?? ""}`.toLowerCase().includes(q))
        .map((item) => ({ id: item.href, label: item.title, hint: section.title, icon: item.icon, href: item.href }))
    )
    if (q) {
      pages.push({
        id: "search-orders",
        label: `Search orders for “${query.trim()}”`,
        hint: variant === "vendor" ? "Order number, customer or product" : "Order number, customer or farm",
        icon: ShoppingCart,
        href: `${ordersHref}?q=${encodeURIComponent(query.trim())}`,
      })
    }
    return pages
  }, [query, sections, variant, ordersHref])

  const go = (command: Command | undefined) => {
    if (!command) return
    setOpen(false)
    setQuery("")
    router.push(command.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, commands.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      go(commands[index])
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [index])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground shadow-xs transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left sm:inline">Search…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Jump to a page or search orders</DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setIndex(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Jump to a page or search orders…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded
              aria-controls="command-list"
              aria-activedescendant={commands[index] ? `command-${index}` : undefined}
            />
          </div>
          <ul id="command-list" ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-2">
            {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>}
            {commands.map((command, i) => (
              <li
                key={command.id}
                id={`command-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(command)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                  i === index ? "bg-accent text-accent-foreground" : "text-foreground"
                )}
              >
                <command.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{command.label}</span>
                <span className="truncate text-xs text-muted-foreground">{command.hint}</span>
                {i === index && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
