"use client"

import { Suspense, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, MessageSquareReply, MessageSquareText, Star, ThumbsDown, ThumbsUp } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch, qs, useAccessToken, useApi } from "@/lib/api"
import { useAnalytics } from "@/lib/use-analytics"
import { formatDateShort, formatNumber } from "@/lib/format"
import type { Paged, VendorReviews } from "@/lib/dashboard-types"
import { useQueryState } from "@/hooks/use-query-state"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { DeltaBadge, EmptyState, ErrorState, PageHeader, Pagination, QueryBoundary, LoadingBlock, SectionCard, SegmentedControl } from "@/components/dashboard/primitives"

interface ReviewRow {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  vendorReply: string | null
  vendorRepliedAt: string | null
  user: { name: string | null }
  product: { id: string; name: string; images: { url: string }[] } | null
}

const PAGE_SIZE = 10

function Stars({ value, size = "size-3.5" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={i < Math.round(value) ? `${size} fill-gold text-gold` : `${size} text-muted-foreground/40`} />
      ))}
    </span>
  )
}

function Reviews() {
  const query = useQueryState()
  const filter = query.get("filter") || "all"
  const page = Number(query.get("page")) || 1
  const summary = useAnalytics<VendorReviews>("/analytics/vendor/reviews")
  const list = useApi<Paged<ReviewRow>>(`/reviews/vendor/me${qs({ filter, page, pageSize: PAGE_SIZE })}`)

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" description="What customers say about your products. Replies appear publicly under the review." actions={<DateRangePicker />} />

      <QueryBoundary query={summary} skeleton={<LoadingBlock className="h-48" />}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="Store rating">
              {data.total === 0 ? (
                <EmptyState icon={Star} title="No reviews yet" description="Customers can review a product once their order is completed." className="py-4" />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end gap-3">
                    <p className="text-4xl font-semibold tabular-nums">{data.average.toFixed(1)}</p>
                    <div className="pb-1">
                      <Stars value={data.average} />
                      <p className="text-xs text-muted-foreground">{formatNumber(data.total)} reviews</p>
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {data.distribution.map((d) => (
                      <li key={d.stars} className="flex items-center gap-2 text-xs">
                        <span className="w-6 tabular-nums text-muted-foreground">{d.stars}★</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-viz-1" style={{ width: `${data.total ? (d.count / data.total) * 100 : 0}%` }} />
                        </span>
                        <span className="w-8 text-right tabular-nums text-muted-foreground">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      {formatNumber(data.inRange.count.value)} new this period <DeltaBadge change={data.inRange.count.change} hasValue={data.inRange.count.value > 0} />
                    </span>
                    {data.inRange.count.value > 0 && <span>avg {data.inRange.average.value.toFixed(1)}★</span>}
                  </div>
                </div>
              )}
            </SectionCard>
            <SectionCard title="Best rated products">
              {data.bestRated.length === 0 ? (
                <EmptyState icon={ThumbsUp} title="Nothing rated 4★+ yet" className="py-4" />
              ) : (
                <ul className="space-y-3">
                  {data.bestRated.map((p) => (
                    <li key={p.productId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <Stars value={p.average} size="size-3" /> {p.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Needs attention" description="Average below 3.5★ or a 1–2★ review in the last 90 days">
              {data.needsAttention.length === 0 ? (
                <EmptyState icon={ThumbsDown} title="No products need attention" className="py-4" />
              ) : (
                <ul className="space-y-3">
                  {data.needsAttention.map((p) => (
                    <li key={p.productId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {p.average.toFixed(1)}★
                        {p.recentLow > 0 && <span className="text-critical">{p.recentLow} low recently</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        )}
      </QueryBoundary>

      <SectionCard
        title="All reviews"
        action={
          <SegmentedControl
            size="xs"
            ariaLabel="Review filter"
            value={filter}
            onChange={(value) => query.set({ filter: value === "all" ? null : value, page: null })}
            options={[
              { value: "all", label: "All" },
              { value: "unanswered", label: "Needs reply", count: summary.data?.unanswered },
              { value: "positive", label: "4–5★" },
              { value: "critical", label: "1–2★" },
            ]}
          />
        }
      >
        {list.error && !list.data ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState icon={MessageSquareText} title={filter === "unanswered" ? "Every review has a reply" : "No reviews here"} />
        ) : (
          <>
            <ul className="divide-y">
              {list.data.data.map((review) => (
                <ReviewItem key={review.id} review={review} />
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(p) => query.set({ page: p === 1 ? null : p })} />
          </>
        )}
      </SectionCard>
    </div>
  )
}

function ReviewItem({ review }: { review: ReviewRow }) {
  const token = useAccessToken()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(review.vendorReply ?? "")
  const [saving, setSaving] = useState(false)

  const save = async (reply: string) => {
    setSaving(true)
    try {
      await apiFetch(`/reviews/${review.id}/reply`, token, { method: "PATCH", body: JSON.stringify({ reply }) })
      toast.success(reply ? "Reply published" : "Reply removed")
      setEditing(false)
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey[1] ?? "")
          return key.startsWith("/reviews/vendor/me") || key.startsWith("/analytics/vendor/reviews") || key.startsWith("/analytics/vendor/insights")
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save reply")
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} />
        <span className="text-sm font-medium">{review.user.name || "Customer"}</span>
        <span className="text-xs text-muted-foreground">
          on {review.product?.name ?? "a product"} · {formatDateShort(review.createdAt)}
        </span>
      </div>
      {review.comment && <p className="mt-1.5 text-sm text-foreground/90">{review.comment}</p>}

      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save(draft)
          }}
        >
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} rows={3} placeholder="Thank the customer or explain how you'll make it right…" autoFocus aria-label="Your reply" />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving || !draft.trim()}>
              {saving && <Loader2 className="animate-spin" />} Publish reply
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">{draft.length}/1000</span>
          </div>
        </form>
      ) : review.vendorReply ? (
        <div className="mt-3 rounded-md border-l-2 border-primary/40 bg-muted/50 px-3 py-2">
          <p className="text-xs font-medium">Your reply</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{review.vendorReply}</p>
          <div className="mt-1.5 flex gap-3 text-xs">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => void save("")} disabled={saving}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="xs" className="mt-2 px-0 text-primary hover:bg-transparent hover:underline" onClick={() => setEditing(true)}>
          <MessageSquareReply /> Reply
        </Button>
      )}
    </li>
  )
}

export default function VendorReviewsPage() {
  return (
    <Suspense fallback={null}>
      <Reviews />
    </Suspense>
  )
}
