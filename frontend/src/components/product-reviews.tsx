"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { BadgeCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StarRating } from "@/components/star-rating"
import { RatingBreakdown } from "@/components/storefront/rating-breakdown"
import { Stars } from "@/components/storefront/rating"
import { formatDate } from "@/lib/format"
import toast from "react-hot-toast"

interface Review {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  user: { id: string; name: string | null }
  vendorReply?: string | null
  vendorRepliedAt?: string | null
}

const PAGE = 6

export function ProductReviews({ productId, farmName }: { productId: string; farmName?: string }) {
  const { data: session } = useSession()
  const [reviews, setReviews] = useState<Review[]>([])
  const [average, setAverage] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState("")
  const [hasMyReview, setHasMyReview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [visible, setVisible] = useState(PAGE)

  const API = process.env.NEXT_PUBLIC_BACKEND_URL

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`${API}/reviews/product/${productId}`)
      if (res.ok) {
        const data = await res.json()
        setReviews(data.reviews)
        setAverage(data.average)
        setCount(data.count)
      }
    } catch (err) {
      console.error("Failed to fetch reviews:", err)
    } finally {
      setLoading(false)
    }
  }, [API, productId])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  useEffect(() => {
    async function fetchMyReview() {
      if (!session?.user?.accessToken) return
      try {
        const res = await fetch(`${API}/reviews/me`, {
          headers: { Authorization: `Bearer ${session.user.accessToken}` },
        })
        if (res.ok) {
          const mine: { productId: string; rating: number; comment: string | null }[] =
            await res.json()
          const existing = mine.find((r) => r.productId === productId)
          if (existing) {
            setHasMyReview(true)
            setMyRating(existing.rating)
            setMyComment(existing.comment || "")
          }
        }
      } catch (err) {
        console.error("Failed to fetch my reviews:", err)
      }
    }
    fetchMyReview()
  }, [API, session, productId])

  async function handleSubmit() {
    if (!session?.user?.accessToken) {
      toast.error("Please log in to leave a review")
      return
    }
    if (myRating < 1) {
      toast.error("Please select a rating")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.user.accessToken}`,
        },
        body: JSON.stringify({ productId, rating: myRating, comment: myComment || undefined }),
      })

      if (res.ok) {
        toast.success(hasMyReview ? "Review updated!" : "Review submitted!")
        setHasMyReview(true)
        setShowForm(false)
        await fetchReviews()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to submit review")
      }
    } catch {
      toast.error("Failed to submit review")
    } finally {
      setSubmitting(false)
    }
  }

  const distribution = Object.fromEntries(
    [5, 4, 3, 2, 1].map((star) => [star, reviews.filter((r) => r.rating === star).length])
  )

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="lg:col-span-4">
        <h2 id="reviews-heading" className="font-serif text-3xl font-medium tracking-[-0.015em]">
          Customer reviews
        </h2>
        {count > 0 ? (
          <div className="mt-5">
            <div className="flex items-center gap-3">
              <span className="font-serif text-5xl font-medium tabular-nums">{average.toFixed(1)}</span>
              <div>
                <Stars value={average} className="text-lg" />
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {count} {count === 1 ? "review" : "reviews"}
                </p>
              </div>
            </div>
            <RatingBreakdown distribution={distribution} total={count} className="mt-6" />
          </div>
        ) : (
          !loading && <p className="mt-4 text-sm text-muted-foreground">No reviews yet.</p>
        )}

        <div className="mt-8 rounded-md border bg-card p-5">
          {session?.user?.accessToken ? (
            !showForm ? (
              <>
                <p className="text-sm font-semibold">{hasMyReview ? "Thanks for your review" : "Bought this?"}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {hasMyReview
                    ? "You can update it at any time."
                    : "Customers with a completed order for this product can share a review."}
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowForm(true)}>
                  {hasMyReview ? "Edit your review" : "Write a review"}
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Your rating</p>
                <StarRating value={myRating} onChange={setMyRating} size="lg" />
                <Textarea
                  value={myComment}
                  onChange={(e) => setMyComment(e.target.value)}
                  placeholder="What did you think? How was the quality and freshness?"
                  rows={4}
                  maxLength={2000}
                  aria-label="Your review"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    {hasMyReview ? "Update Review" : "Submit Review"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only customers with a completed order for this product can leave a review.
                </p>
              </div>
            )
          ) : (
            <>
              <p className="text-sm font-semibold">Bought this?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>{" "}
                to review a product from a completed order.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="lg:col-span-8">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-md border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            No reviews yet. Reviews appear here once customers receive their orders.
          </div>
        ) : (
          <>
            <ul className="divide-y border-y">
              {reviews.slice(0, visible).map((review) => (
                <li key={review.id} className="py-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Stars value={review.rating} className="text-sm" />
                      <p className="text-sm font-semibold">{review.user.name || "Anonymous"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-olive">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified purchase
                  </p>
                  {review.comment && (
                    <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-foreground/85">{review.comment}</p>
                  )}
                  {review.vendorReply && (
                    <div className="mt-4 border-l-2 border-primary/40 bg-secondary/60 px-4 py-3">
                      <p className="text-xs font-semibold text-foreground">
                        Reply from {farmName ?? "the farm"}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.vendorReply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {visible < reviews.length && (
              <Button variant="outline" className="mt-6" onClick={() => setVisible((v) => v + PAGE)}>
                Show more reviews ({reviews.length - visible})
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
