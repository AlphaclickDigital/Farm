"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Bell, CheckCircle2, Info, OctagonAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, useAccessToken } from "@/lib/api"
import { formatRelative } from "@/lib/format"

export interface AppNotification {
  id: string
  type: string
  severity: "info" | "success" | "warning" | "critical"
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export const severityStyles = {
  info: { icon: Info, className: "text-info bg-info/10" },
  success: { icon: CheckCircle2, className: "text-good bg-good/10" },
  positive: { icon: CheckCircle2, className: "text-good bg-good/10" },
  warning: { icon: AlertTriangle, className: "text-warning bg-warning/10" },
  critical: { icon: OctagonAlert, className: "text-critical bg-critical/10" },
} as const

/** Invalidate every cached notifications query (bell badge, dropdown, page). */
export function useRefreshNotifications() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[1] ?? "").startsWith("/notifications"),
    })
}

export function NotificationList({
  notifications,
  onNavigate,
  compact = false,
}: {
  notifications: AppNotification[]
  onNavigate?: () => void
  compact?: boolean
}) {
  const token = useAccessToken()
  const refresh = useRefreshNotifications()

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Bell className="size-5 text-muted-foreground" />
        </span>
        <p className="text-sm font-medium">You&apos;re all caught up</p>
        <p className="text-xs text-muted-foreground">New orders, stock alerts and payouts will show up here.</p>
      </div>
    )
  }

  const markRead = async (n: AppNotification) => {
    if (n.readAt) return
    await apiFetch(`/notifications/${n.id}/read`, token, { method: "PATCH" }).catch(() => null)
    void refresh()
  }

  return (
    <ul className="divide-y">
      {notifications.map((n) => {
        const style = severityStyles[n.severity] ?? severityStyles.info
        const content = (
          <div className={cn("flex gap-3 px-4", compact ? "py-3" : "py-4")}>
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", style.className)}>
              <style.icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm", n.readAt ? "text-muted-foreground" : "font-medium text-foreground")}>
                {n.title}
              </p>
              {n.body && (
                <p className={cn("mt-0.5 text-xs text-muted-foreground", compact && "line-clamp-2")}>{n.body}</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground/80">{formatRelative(n.createdAt)}</p>
            </div>
            {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          </div>
        )
        return (
          <li key={n.id} className="transition-colors hover:bg-muted/50">
            {n.link ? (
              <Link
                href={n.link}
                onClick={() => {
                  void markRead(n)
                  onNavigate?.()
                }}
                className="block focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                {content}
              </Link>
            ) : (
              <button type="button" className="block w-full text-left" onClick={() => void markRead(n)}>
                {content}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
