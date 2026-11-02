"use client"

import { useState } from "react"
import { CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetch, qs, useAccessToken, useApi } from "@/lib/api"
import type { Paged } from "@/lib/dashboard-types"
import { NotificationList, useRefreshNotifications, type AppNotification } from "./notification-list"
import { ErrorState, PageHeader, Pagination, SectionCard, SegmentedControl } from "./primitives"

const PAGE_SIZE = 20

export function NotificationsPage({ description }: { description: string }) {
  const token = useAccessToken()
  const refresh = useRefreshNotifications()
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [page, setPage] = useState(1)
  const list = useApi<Paged<AppNotification> & { unread: number }>(
    `/notifications${qs({ page, pageSize: PAGE_SIZE, unreadOnly: filter === "unread" ? "true" : undefined })}`,
  )

  const markAll = async () => {
    await apiFetch("/notifications/read-all", token, { method: "POST" }).catch(() => null)
    void refresh()
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={description}
        actions={
          list.data?.unread ? (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck /> Mark all as read
            </Button>
          ) : undefined
        }
      />
      <SectionCard
        contentClassName="p-0"
        title={
          <SegmentedControl
            size="xs"
            ariaLabel="Notification filter"
            value={filter}
            onChange={(value) => {
              setFilter(value)
              setPage(1)
            }}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread", count: list.data?.unread },
            ]}
          />
        }
      >
        <div className="pt-3">
          {list.error && !list.data ? (
            <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
          ) : !list.data ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <NotificationList notifications={list.data.data} />
          )}
        </div>
        <div className="px-5 pb-5">
          {list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />}
        </div>
      </SectionCard>
    </div>
  )
}
