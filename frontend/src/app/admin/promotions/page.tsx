"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { CalendarClock, CircleDollarSign, Loader2, Megaphone, Search, Settings, ShoppingBag, Timer } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiFetch, qs, useAccessToken, useApi } from "@/lib/api"
import { useAnalytics } from "@/lib/use-analytics"
import { formatCents, formatDateShort, formatNumber } from "@/lib/format"
import type { Paged, PromotionRow, PromotionsOverview } from "@/lib/dashboard-types"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { ExportButton } from "@/components/dashboard/export-button"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { BarList, ColumnChart } from "@/components/dashboard/charts"
import { StateBadge } from "@/components/dashboard/status-badge"
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, QueryBoundary, SectionCard, SegmentedControl } from "@/components/dashboard/primitives"

type State = "all" | "active" | "expired" | "cancelled"
const PAGE_SIZE = 15

export default function AdminPromotionsPage() {
  const overview = useAnalytics<PromotionsOverview>("/analytics/admin/promotions")
  const config = useApi<{ key: string; value: string }[]>("/admin/configuration")
  const [state, setState] = useState<State>("all")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search, 300)
  const list = useApi<Paged<PromotionRow>>(`/analytics/admin/promotions/list${qs({ state, q, page, pageSize: PAGE_SIZE })}`)
  const [target, setTarget] = useState<PromotionRow | null>(null)

  const o = overview.data
  const price = Number(config.data?.find((c) => c.key === "featured_listing_price_cents")?.value ?? 2000)
  const days = Number(config.data?.find((c) => c.key === "featured_listing_duration_days")?.value ?? 7)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions & advertising"
        description="Paid featured listings on the homepage. Revenue is recognised when a listing is purchased; listings are paid upfront and not refunded automatically."
        actions={
          <>
            <ExportButton path="/analytics/admin/export/promotions" label="Export" />
            <DateRangePicker />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Listing revenue"
          icon={CircleDollarSign}
          loading={!o}
          value={o && formatCents(o.revenue.value)}
          change={o?.revenue.change}
          hint="Featured-listing purchases in this period."
        />
        <KpiCard label="Listings sold" icon={ShoppingBag} loading={!o} value={o && formatNumber(o.purchases.value)} change={o?.purchases.change} />
        <KpiCard
          label="Live now"
          icon={Megaphone}
          loading={!o}
          value={o && formatNumber(o.counts.active)}
          footnote={o && <span>{formatNumber(o.counts.expired)} expired · {formatNumber(o.counts.cancelled)} deactivated</span>}
        />
        <KpiCard
          label="Current package"
          icon={Settings}
          loading={!config.data}
          value={`${formatCents(price)} / ${days} days`}
          footnote={
            <Link href="/admin/settings" className="text-primary hover:underline">
              Change pricing in Settings
            </Link>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Listing revenue over time">
          <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-60" />}>
            {(data) => <ColumnChart granularity={data.range.granularity} data={data.series} series={[{ key: "revenue", label: "Listing revenue" }]} height={220} />}
          </QueryBoundary>
        </SectionCard>
        <SectionCard title="Expiring within 3 days">
          <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-60" />}>
            {(data) =>
              data.expiringSoon.length === 0 ? (
                <EmptyState icon={Timer} title="Nothing expiring soon" className="py-6" />
              ) : (
                <ul className="space-y-3">
                  {data.expiringSoon.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.product?.name ?? `${p.vendor.storeName} (store)`}</p>
                        <p className="text-xs text-muted-foreground">{p.vendor.storeName}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-warning">
                        <CalendarClock className="size-3.5" /> {formatDateShort(p.endDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryBoundary>
        </SectionCard>
      </div>

      <QueryBoundary query={overview} skeleton={<LoadingBlock className="h-56" />}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="Spend by vendor" description="Listing purchases in this period">
              {data.spendByVendor.length === 0 ? (
                <EmptyState icon={Megaphone} title="No purchases in this period" />
              ) : (
                <BarList items={data.spendByVendor.map((v) => ({ key: v.vendorId, label: v.storeName, value: v.spend, sub: `${v.promotions} listing${v.promotions === 1 ? "" : "s"}` }))} />
              )}
            </SectionCard>
            <SectionCard title="Most promoted products">
              {data.mostPromoted.length === 0 ? (
                <EmptyState icon={Megaphone} title="No product listings in this period" />
              ) : (
                <BarList
                  format="number"
                  items={data.mostPromoted.map((p) => ({ key: p.productId, label: p.name, value: p.promotions, sub: p.storeName }))}
                  valueLabel={(item) => `${item.value}×`}
                />
              )}
            </SectionCard>
            <SectionCard title="By listing type">
              <BarList
                items={data.byType.map((t) => ({
                  key: t.type,
                  label: t.type === "FEATURED_PRODUCT" ? "Featured product" : "Featured store",
                  value: t.revenue,
                  sub: `${t.count} sold`,
                }))}
              />
            </SectionCard>
          </div>
        )}
      </QueryBoundary>

      <SectionCard
        title="All listings"
        description="Sales during a listing are compared with the same length of time before it. This is a before/after view, not attribution."
        contentClassName="p-0"
        action={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Farm or product…"
              className="h-8 pl-8 sm:w-52"
              aria-label="Search promotions"
            />
          </div>
        }
      >
        <div className="border-b px-5 pb-3 pt-1">
          <SegmentedControl<State>
            size="xs"
            ariaLabel="Listing state"
            value={state}
            onChange={(v) => {
              setState(v)
              setPage(1)
            }}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Live", count: o?.counts.active },
              { value: "expired", label: "Expired", count: o?.counts.expired },
              { value: "cancelled", label: "Deactivated", count: o?.counts.cancelled },
            ]}
          />
        </div>
        {list.error && !list.data ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={Megaphone} title="No listings match" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Listing</TableHead>
                  <TableHead className="hidden md:table-cell">Runs</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Sales during / before</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={list.isFetching ? "opacity-60" : undefined}>
                {list.data.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-5">
                      <p className="font-medium">{p.product?.name ?? "Whole store"}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.vendor.storeName} · {p.type === "FEATURED_PRODUCT" ? "Featured product" : "Featured store"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                      {formatDateShort(p.startDate)} – {formatDateShort(p.endDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="tabular-nums">{formatCents(p.priceCents)}</p>
                      <p className="max-w-32 truncate font-mono text-[10px] text-muted-foreground" title={p.stripePaymentId}>
                        {p.stripePaymentId}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right text-sm tabular-nums lg:table-cell">
                      {p.salesDuring === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {formatCents(p.salesDuring)} <span className="text-muted-foreground">/ {formatCents(p.salesBefore ?? 0)}</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={p.state} />
                      {p.state === "active" && <p className="mt-0.5 text-[11px] text-muted-foreground">until {formatDateShort(p.endDate)}</p>}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {p.state === "active" && (
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setTarget(p)}>
                          Deactivate
                        </Button>
                      )}
                      {p.state === "cancelled" && new Date(p.endDate) > new Date() && (
                        <Button variant="ghost" size="xs" onClick={() => setTarget(p)}>
                          Reactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-5 pb-5">{list.data && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} loading={list.isFetching} onPageChange={setPage} />}</div>
      </SectionCard>

      <ModerationDialog promotion={target} onClose={() => setTarget(null)} />
    </div>
  )
}

function ModerationDialog({ promotion, onClose }: { promotion: PromotionRow | null; onClose: () => void }) {
  const token = useAccessToken()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const deactivating = promotion?.state === "active"

  const submit = async () => {
    if (!promotion) return
    setSaving(true)
    try {
      await apiFetch(`/admin/promotions/${promotion.id}/status`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: deactivating ? "CANCELLED" : "ACTIVE", reason: reason.trim() || undefined }),
      })
      toast.success(deactivating ? "Listing deactivated" : "Listing reactivated")
      setReason("")
      onClose()
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[1] ?? "").startsWith("/analytics/admin") })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update listing")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!promotion} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deactivating ? "Deactivate featured listing?" : "Reactivate featured listing?"}</DialogTitle>
          <DialogDescription>
            {promotion?.product?.name ?? "Store listing"} by {promotion?.vendor.storeName}.{" "}
            {deactivating
              ? "It will disappear from the homepage immediately. The vendor is notified; no refund is issued automatically."
              : "It will show on the homepage again until its original end date."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="moderation-reason">Reason (shared with the vendor)</Label>
          <Textarea id="moderation-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="Optional" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant={deactivating ? "destructive" : "default"} onClick={submit} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {deactivating ? "Deactivate" : "Reactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
