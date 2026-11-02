"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetch, useAccessToken, useApi } from "@/lib/api"
import { NotificationList, useRefreshNotifications, type AppNotification } from "./notification-list"
import type { DashboardVariant } from "./dashboard-shell"

export function NotificationBell({ variant }: { variant: DashboardVariant }) {
  const [open, setOpen] = useState(false)
  const token = useAccessToken()
  const refresh = useRefreshNotifications()
  const { data: count } = useApi<{ count: number }>("/notifications/unread-count", {
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
  const { data: list, isLoading } = useApi<{ data: AppNotification[] }>(open ? "/notifications?pageSize=8" : null)
  const unread = count?.count ?? 0
  const pageHref = variant === "vendor" ? "/vendor/dashboard/notifications" : "/admin/notifications"

  const markAll = async () => {
    await apiFetch("/notifications/read-all", token, { method: "POST" }).catch(() => null)
    void refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold leading-4 text-terracotta-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[90vw] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={markAll}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <NotificationList notifications={list?.data ?? []} compact onNavigate={() => setOpen(false)} />
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href={pageHref} onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
