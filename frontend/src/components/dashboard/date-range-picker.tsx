"use client"

import { useState } from "react"
import { CalendarDays, Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RANGE_OPTIONS, useDashboardRange, type RangePreset } from "@/store/use-dashboard-range"

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" })
}

function formatKey(key: string) {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function DateRangePicker({ className }: { className?: string }) {
  const { range, from, to, setPreset, setCustom } = useDashboardRange()
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(from ?? "")
  const [draftTo, setDraftTo] = useState(to ?? todayKey())
  const max = todayKey()

  const label =
    range === "custom" && from && to
      ? `${formatKey(from)} – ${formatKey(to)}`
      : RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "Last 30 days"
  const invalid = !draftFrom || !draftTo || draftFrom > draftTo || draftTo > max

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("justify-start gap-2 font-normal", className)}>
          <CalendarDays className="text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-auto text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-1.5" role="listbox" aria-label="Date range">
          {RANGE_OPTIONS.filter((o) => o.value !== "custom").map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={range === option.value}
              onClick={() => {
                setPreset(option.value as Exclude<RangePreset, "custom">)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              {option.label}
              {range === option.value && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
        <form
          className="space-y-3 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (invalid) return
            setCustom(draftFrom, draftTo)
            setOpen(false)
          }}
        >
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-xs">From</Label>
              <Input id="range-from" type="date" max={max} value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-xs">To</Label>
              <Input id="range-to" type="date" max={max} value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          {draftFrom && draftTo && draftFrom > draftTo && (
            <p className="text-xs text-destructive">The start date must be before the end date.</p>
          )}
          <Button type="submit" size="sm" className="w-full" disabled={invalid}>
            Apply range
          </Button>
          <p className="text-[11px] text-muted-foreground">Dates are in Sydney time (AEST/AEDT).</p>
        </form>
      </PopoverContent>
    </Popover>
  )
}
