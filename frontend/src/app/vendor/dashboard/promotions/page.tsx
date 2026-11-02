"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { Loader2, Megaphone, Store, Package } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { formatCents, formatDate } from "@/lib/format"
import toast from "react-hot-toast"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

type PromotionType = "FEATURED_PRODUCT" | "FEATURED_VENDOR"

interface Product {
  id: string
  name: string
  isActive: boolean
}

interface Promotion {
  id: string
  type: PromotionType
  status: string
  startDate: string
  endDate: string
  priceCents: number
  product: { id: string; name: string } | null
}

function isCurrentlyActive(promo: Promotion) {
  return promo.status === "ACTIVE" && new Date(promo.endDate) >= new Date()
}

function PromotionPaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setProcessing(true)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    })

    if (error) {
      toast.error(error.message || "Payment failed")
      setProcessing(false)
      return
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      onSuccess()
    } else {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button onClick={handlePay} disabled={!stripe || processing} className="w-full">
        {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Pay & Activate
      </Button>
    </div>
  )
}

export default function VendorPromotionsPage() {
  const { data: session } = useSession()
  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProductId, setSelectedProductId] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [clientSecret, setClientSecret] = useState("")
  const [pendingPaymentIntentId, setPendingPaymentIntentId] = useState("")
  const [priceCents, setPriceCents] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const api = useCallback(
    (path: string, options?: RequestInit) =>
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.user?.accessToken}`,
          ...options?.headers,
        },
      }),
    [session]
  )

  const fetchAll = useCallback(async () => {
    try {
      const [productsRes, promotionsRes] = await Promise.all([
        api("/products/vendor/my-products"),
        api("/promotions/me"),
      ])
      if (productsRes.ok) {
        const data: Product[] = await productsRes.json()
        setProducts(data.filter((p) => p.isActive))
      }
      if (promotionsRes.ok) setPromotions(await promotionsRes.json())
    } catch (err) {
      console.error("Failed to fetch promotions data:", err)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (session?.user?.accessToken) fetchAll()
  }, [session, fetchAll])

  async function startPromotion(type: PromotionType, productId?: string) {
    try {
      const res = await api("/promotions/intent", {
        method: "POST",
        body: JSON.stringify({ type, productId }),
      })
      if (res.ok) {
        const data = await res.json()
        setClientSecret(data.clientSecret)
        setPendingPaymentIntentId(data.paymentIntentId)
        setPriceCents(data.priceCents)
        setDialogOpen(true)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to start promotion")
      }
    } catch {
      toast.error("Failed to start promotion")
    }
  }

  async function handlePaymentSuccess() {
    setConfirming(true)
    try {
      const res = await api("/promotions/confirm", {
        method: "POST",
        body: JSON.stringify({ paymentIntentId: pendingPaymentIntentId }),
      })
      if (res.ok) {
        toast.success("Promotion activated!")
        setDialogOpen(false)
        setClientSecret("")
        await fetchAll()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Payment succeeded but activation failed")
      }
    } catch {
      toast.error("Payment succeeded but activation failed")
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Promotions</h1>
        <p className="text-muted-foreground">
          Pay to feature your store or a product on the homepage
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Feature My Store
            </CardTitle>
            <CardDescription>
              Get your store shown in the &quot;Featured Farmers&quot; section on the homepage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => startPromotion("FEATURED_VENDOR")}>
              <Megaphone className="mr-2 h-4 w-4" />
              Feature My Store
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Feature a Product
            </CardTitle>
            <CardDescription>
              Get one of your products shown in the featured section on the homepage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add an active product first to feature it.
              </p>
            ) : (
              <>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={!selectedProductId}
                  onClick={() => startPromotion("FEATURED_PRODUCT", selectedProductId)}
                >
                  <Megaphone className="mr-2 h-4 w-4" />
                  Feature This Product
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promotion History</CardTitle>
        </CardHeader>
        <CardContent>
          {promotions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No promotions yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ends</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotions.map((promo) => (
                    <TableRow key={promo.id}>
                      <TableCell>
                        {promo.type === "FEATURED_VENDOR" ? "Store" : "Product"}
                      </TableCell>
                      <TableCell>{promo.product?.name || "My Store"}</TableCell>
                      <TableCell>{formatCents(promo.priceCents)}</TableCell>
                      <TableCell>
                        <Badge variant={isCurrentlyActive(promo) ? "default" : "secondary"}>
                          {isCurrentlyActive(promo) ? "Active" : "Expired"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(promo.endDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Stripe's Payment Element can expand (e.g. Link sign-up fields), so
            the dialog must scroll rather than push "Pay & Activate" off-screen. */}
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
            <DialogDescription>
              {priceCents > 0 && `${formatCents(priceCents)} — featured placement`}
            </DialogDescription>
          </DialogHeader>
          {confirming ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#3B5D42",
                    colorBackground: "#FFFDF7",
                    colorText: "#2B2118",
                    borderRadius: "8px",
                  },
                },
              }}
            >
              <PromotionPaymentForm onSuccess={handlePaymentSuccess} />
            </Elements>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
