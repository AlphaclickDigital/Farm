"use client"

import { useState } from "react"
import { Activity, ShieldCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { qs, useApi } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { ActivityItem, AuditEntry, Paged } from "@/lib/dashboard-types"
import { ActivityTimeline } from "@/components/dashboard/activity-timeline"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { EmptyState, ErrorState, PageHeader, Pagination, QueryBoundary, LoadingBlock, SectionCard, SegmentedControl } from "@/components/dashboard/primitives"

const PAGE_SIZE = 25

function actionTone(action: string) {
  if (/FAILED|DISPUTE|SUSPENDED|REJECTED|DELETED/.test(action)) return "critical" as const
  if (/REFUNDED|CANCELLED|STATUS_CHANGED/.test(action)) return "warning" as const
  if (/APPROVED|UNSUSPENDED|CREATED/.test(action)) return "good" as const
  return "neutral" as const
}

export default function ActivityPage() {
  const [tab, setTab] = useState<"feed" | "audit">("feed")
  const [page, setPage] = useState(1)
  const feed = useApi<ActivityItem[]>(tab === "feed" ? "/analytics/admin/activity?limit=100" : null)
  const audit = useApi<Paged<AuditEntry>>(tab === "audit" ? `/analytics/admin/audit${qs({ page, pageSize: PAGE_SIZE })}` : null)

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Marketplace events as they happen, plus an audit trail of administrative and system actions."
      />
      <SectionCard
        title={
          <SegmentedControl
            size="xs"
            ariaLabel="Activity view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "feed", label: "Marketplace feed" },
              { value: "audit", label: "Audit trail" },
            ]}
          />
        }
      >
        {tab === "feed" ? (
          <QueryBoundary query={feed} skeleton={<LoadingBlock className="h-96" />}>
            {(items) => (items.length === 0 ? <EmptyState icon={Activity} title="No activity yet" /> : <ActivityTimeline items={items} />)}
          </QueryBoundary>
        ) : audit.error && !audit.data ? (
          <ErrorState message={audit.error.message} onRetry={() => audit.refetch()} />
        ) : !audit.data ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : audit.data.data.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No audited actions yet" description="Vendor approvals, refunds, payouts, setting changes and promotion moderation are recorded here." />
        ) : (
          <>
            <div className="-mx-5 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="pr-5">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.data.data.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap pl-5 text-sm text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={actionTone(entry.action)}>{entry.action.toLowerCase().replace(/_/g, " ")}</StatusBadge>
                      </TableCell>
                      <TableCell className="max-w-md text-sm">{entry.summary}</TableCell>
                      <TableCell className="pr-5 text-sm text-muted-foreground">{entry.actor ? entry.actor.name || entry.actor.email : entry.actorRole === "SYSTEM" ? "System" : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={audit.data.total} onPageChange={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  )
}
