"use client"

import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { severityStyles } from "./notification-list"
import { EmptyState } from "./primitives"

export interface Insight {
  id: string
  severity: "critical" | "warning" | "positive" | "info"
  title: string
  description: string
  action?: { label: string; href: string }
}

/** Rule-based insights computed by the API from marketplace data. */
export function InsightsPanel({
  insights,
  loading,
  emptyTitle = "Nothing needs your attention",
  emptyDescription = "We'll flag stock, order and sales changes here as they happen.",
  limit,
}: {
  insights?: Insight[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  limit?: number
}) {
  if (loading || !insights) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  }
  if (insights.length === 0) {
    return <EmptyState icon={Sparkles} title={emptyTitle} description={emptyDescription} className="py-6" />
  }
  return (
    <ul className="space-y-2.5">
      {insights.slice(0, limit).map((insight) => {
        const style = severityStyles[insight.severity] ?? severityStyles.info
        return (
          <li key={insight.id} className="flex gap-3 rounded-lg border bg-background/60 p-3">
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", style.className)}>
              <style.icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-foreground">{insight.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{insight.description}</p>
              {insight.action && (
                <Link
                  href={insight.action.href}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {insight.action.label}
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
