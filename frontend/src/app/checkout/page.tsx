"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import {
  Loader2,
  Lock,
  ChevronRight,
  ChevronLeft,
  Check,
  Store,
  Truck,
  AlertCircle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import toast from "react-hot-toast"
import { useCartStore } from "@/store/use-cart-store"
import { formatCents } from "@/lib/format"
import { CartItemRow } from "@/components/cart-item-row"
import { useFarmDirectory } from "@/lib/use-storefront-data"
import { AU_STATES } from "@/lib/storefront"
import { cn } from "@/lib/utils"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

interface ShippingAddress {
  name: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
}

type ShippingMethodType = "FLAT_RATE" | "WEIGHT_BASED" | "PICKUP"

interface VendorShippingOption {
  id: string
  name: string
  description: string | null
  type: ShippingMethodType
  flatRateCents: number | null
  minOrderCents: number | null
  estimatedDays: string
  costCents: number | null
  isFree: boolean
  available: boolean
  unavailableReason?: string
  matchedTier?: { minGrams: number; maxGrams: number | null } | null
}

interface ShippingSelection {
  vendorId: string
  shippingOptionId: string
}

// ─── Address validation ───

const ADDRESS_ERRORS: Record<keyof ShippingAddress, (v: string) => string | null> = {
  name: (v) => (v.trim() ? null : "Enter the name for this delivery"),
  address: (v) => (v.trim() ? null : "Enter a street address"),
  city: (v) => (v.trim() ? null : "Enter a suburb or town"),
  state: (v) => (AU_STATES.some((s) => s.code === v) ? null : "Choose a state"),
  zip: (v) => (/^\d{4}$/.test(v.trim()) ? null : "Australian postcodes have 4 digits"),
  phone: (v) =>
    /^[0-9+()\s-]+$/.test(v.trim()) && v.replace(/\D/g, "").length >= 8
      ? null
      : "Enter a phone number the farm can call about delivery",
}

// --- Step 3: Payment Form ---
function PaymentForm({
  clientSecret,
  shippingAddress,
  shippingSelections,
  onOrderPlaced,
  totalCents,
}: {
  clientSecret: string
  shippingAddress: ShippingAddress
  shippingSelections: ShippingSelection[]
  onOrderPlaced: () => void
  totalCents: number
}) {
  const stripe = useStripe()
  const elements = useElements()
  const { data: session } = useSession()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const clearCart = useCartStore((s) => s.clearCart)
  const items = useCartStore((s) => s.items)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) return

    setIsProcessing(true)
    setErrorMessage("")

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    })

    if (error) {
      toast.error(error.message || "Payment failed")
      setErrorMessage(error.message || "Payment failed")
      setIsProcessing(false)
      return
    }

    if (paymentIntent && paymentIntent.status === "succeeded") {
      try {
        const cartItems = items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          priceCents: item.priceCents,
        }))

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/payment/create-order`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.user?.accessToken}`,
            },
            body: JSON.stringify({
              paymentIntentId: paymentIntent.id,
              items: cartItems,
              shippingAddress,
              shippingSelections,
            }),
          }
        )

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.message || "Failed to create order")
        }

        const order = await res.json()
        onOrderPlaced()
        clearCart()
        toast.success("Order placed successfully!")
        router.push(`/orders/${order.id}?success=true`)
      } catch (err) {
        console.error("Order creation failed:", err)
        setErrorMessage(
          "Payment successful but order creation failed. Please contact support with payment ID: " +
            paymentIntent.id
        )
        setIsProcessing(false)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />

      {errorMessage && (
        <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            Pay Now
            <span className="tabular-nums">· {formatCents(totalCents)}</span>
          </>
        )}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Card details go straight to Stripe — FarmMarket never sees or stores them.
      </p>
    </form>
  )
}

const STEPS = [
  { num: 1, label: "Delivery details" },
  { num: 2, label: "Delivery options" },
  { num: 3, label: "Payment" },
]

function StepPanel({
  num,
  title,
  current,
  summary,
  onEdit,
  children,
}: {
  num: number
  title: string
  current: number
  summary?: React.ReactNode
  onEdit?: () => void
  children: React.ReactNode
}) {
  const done = current > num
  const active = current === num
  return (
    <section
      aria-labelledby={`step-${num}`}
      className={cn("rounded-lg border bg-card", active ? "border-foreground/20 shadow-[0_8px_30px_-18px_rgb(43_33_24/0.3)]" : "")}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <h2 id={`step-${num}`} className="flex items-center gap-3 font-semibold">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
              done ? "bg-primary text-primary-foreground" : active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : num}
          </span>
          <span className={cn(!active && !done && "text-muted-foreground")}>{title}</span>
        </h2>
        {done && onEdit && (
          <button type="button" onClick={onEdit} className="text-sm font-semibold text-primary hover:underline">
            Edit
          </button>
        )}
      </header>
      {done && summary && <div className="px-5 pb-4 pl-[3.75rem] text-sm text-muted-foreground sm:px-6 sm:pl-[4.25rem]">{summary}</div>}
      {active && <div className="border-t px-5 py-6 sm:px-6">{children}</div>}
    </section>
  )
}

// --- Main Checkout Page ---
export default function CheckoutPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const items = useCartStore((s) => s.items)
  const getTotalItems = useCartStore((s) => s.getTotalItems)
  const getTotalPrice = useCartStore((s) => s.getTotalPrice)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const { data: farms } = useFarmDirectory()

  const totalItems = getTotalItems()
  const productSubtotal = getTotalPrice()

  // Steps: 1 = Address, 2 = Shipping, 3 = Payment
  const [step, setStep] = useState(1)

  // Address state
  const [address, setAddress] = useState<ShippingAddress>({
    name: "",
    address: "",
    city: "",
    state: "VIC",
    zip: "",
    phone: "",
  })
  const [touched, setTouched] = useState<Partial<Record<keyof ShippingAddress, boolean>>>({})

  // Shipping state
  const [vendorShippingOptions, setVendorShippingOptions] = useState<
    Record<string, { vendorName: string; options: VendorShippingOption[] }>
  >({})
  const [shippingSelections, setShippingSelections] = useState<
    Record<string, string>
  >({})
  const [loadingShipping, setLoadingShipping] = useState(false)

  // Payment state
  const [clientSecret, setClientSecret] = useState("")
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [error, setError] = useState("")

  const API = process.env.NEXT_PUBLIC_BACKEND_URL

  // Set once payment succeeds: the cart is then emptied on the way to the
  // order confirmation page, which must not trigger the empty-cart redirect.
  const orderPlacedRef = useRef(false)

  useEffect(() => {
    // Read the store directly: during the hydration render the subscribed
    // `items` is still the empty initial state, which would bounce a refresh
    // or direct visit to /checkout back to /cart.
    if (!orderPlacedRef.current && useCartStore.getState().items.length === 0) {
      router.push("/cart")
    }
  }, [items, router])

  // Get unique vendor IDs from cart
  const vendorIds = [...new Set(items.map((item) => item.vendorId))]

  // Group items by vendor
  const itemsByVendor: Record<string, typeof items> = {}
  for (const item of items) {
    if (!itemsByVendor[item.vendorId]) {
      itemsByVendor[item.vendorId] = []
    }
    itemsByVendor[item.vendorId].push(item)
  }

  const vendorName = (vendorId: string) =>
    vendorShippingOptions[vendorId]?.vendorName ??
    itemsByVendor[vendorId]?.[0]?.vendorName ??
    farms?.get(vendorId)?.storeName ??
    "Farm"

  const selectedOption = (vendorId: string) =>
    vendorShippingOptions[vendorId]?.options.find((o) => o.id === shippingSelections[vendorId])

  // Shipping cost is authoritatively computed backend-side by the quote
  // endpoint (handles flat-rate, weight-based tiers, and pickup uniformly).
  const shippingCost = vendorIds.reduce((total, vendorId) => {
    const option = selectedOption(vendorId)
    return total + (option?.costCents ?? 0)
  }, 0)
  const grandTotal = productSubtotal + shippingCost

  // Address validation
  const addressErrors = Object.fromEntries(
    (Object.keys(ADDRESS_ERRORS) as (keyof ShippingAddress)[]).map((key) => [key, ADDRESS_ERRORS[key](address[key])])
  ) as Record<keyof ShippingAddress, string | null>
  const isAddressValid = Object.values(addressErrors).every((e) => e === null)
  const unavailableItems = items.filter((i) => i.unavailable)

  // Shipping validation
  const isShippingValid = vendorIds.every((vendorId) => {
    const selectedId = shippingSelections[vendorId]
    if (!selectedId) return false
    const option = vendorShippingOptions[vendorId]?.options.find(
      (o) => o.id === selectedId
    )
    return option?.available !== false
  })

  async function loadShippingOptions() {
    setLoadingShipping(true)
    const results: typeof vendorShippingOptions = {}

    for (const vendorId of vendorIds) {
      try {
        const vendorItems = (itemsByVendor[vendorId] || []).map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          priceCents: item.priceCents,
        }))

        const [quoteRes, vendorRes] = await Promise.all([
          fetch(`${API}/vendors/${vendorId}/shipping/quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: vendorItems }),
          }),
          fetch(`${API}/vendors/${vendorId}`),
        ])

        if (quoteRes.ok) {
          const options: VendorShippingOption[] = await quoteRes.json()
          const vendorData = vendorRes.ok ? await vendorRes.json() : null

          results[vendorId] = {
            vendorName: vendorData?.storeName || "Vendor",
            options,
          }

          // Auto-select first available option if none selected yet
          const firstAvailable = options.find((o) => o.available !== false)
          if (firstAvailable && !shippingSelections[vendorId]) {
            setShippingSelections((prev) => ({
              ...prev,
              [vendorId]: firstAvailable.id,
            }))
          }
        }
      } catch (err) {
        console.error(`Failed to load shipping for vendor ${vendorId}:`, err)
      }
    }

    setVendorShippingOptions(results)
    setLoadingShipping(false)
  }

  async function goToStep2() {
    if (!isAddressValid) {
      setTouched({ name: true, address: true, city: true, state: true, zip: true, phone: true })
      return
    }
    setStep(2)
    await loadShippingOptions()
  }

  async function goToStep3() {
    setLoadingPayment(true)
    setError("")

    try {
      const cartItems = items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        priceCents: item.priceCents,
      }))

      const shipSelections = Object.entries(shippingSelections).map(
        ([vendorId, shippingOptionId]) => ({
          vendorId,
          shippingOptionId,
        })
      )

      const res = await fetch(`${API}/payment/create-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.user?.accessToken}`,
        },
        body: JSON.stringify({
          items: cartItems,
          shippingSelections: shipSelections,
          shippingAddress: address,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(
          errorData.message || "Failed to create payment intent"
        )
      }

      const data = await res.json()
      setClientSecret(data.clientSecret)
      setStep(3)
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : "Failed to initialize checkout. Please try again."
      toast.error(msg)
      setError(msg)
    } finally {
      setLoadingPayment(false)
    }
  }

  if (items.length === 0) {
    return null
  }

  const field = (key: keyof ShippingAddress, label: string, props: React.ComponentProps<typeof Input> = {}) => {
    const message = touched[key] ? addressErrors[key] : null
    return (
      <div className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          value={address[key]}
          onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
          onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
          aria-invalid={!!message}
          aria-describedby={message ? `${key}-error` : undefined}
          className="h-11 bg-background"
          {...props}
        />
        {message && (
          <p id={`${key}-error`} className="text-xs text-destructive">
            {message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="shell pb-24 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-4xl font-medium tracking-[-0.02em]">Checkout</h1>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Secure checkout powered by Stripe
        </p>
      </div>

      <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs font-semibold" aria-label="Checkout progress">
        {STEPS.map((s, idx) => (
          <li key={s.num} className="flex items-center gap-2" aria-current={step === s.num ? "step" : undefined}>
            {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={cn(step === s.num ? "text-foreground" : step > s.num ? "text-primary" : "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left: Step Content */}
        <div className="space-y-4 lg:col-span-7">
          <StepPanel
            num={1}
            title="Delivery details"
            current={step}
            onEdit={() => setStep(1)}
            summary={
              <>
                <p className="font-medium text-foreground">{address.name}</p>
                <p>
                  {address.address}, {address.city} {address.state} {address.zip}
                </p>
                <p>{address.phone}</p>
              </>
            }
          >
            <div className="space-y-5">
              {session?.user?.email && (
                <p className="rounded-md bg-secondary/60 px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">Order updates go to </span>
                  <span className="font-semibold">{session.user.email}</span>
                </p>
              )}
              {field("name", "Full name", { placeholder: "Sam Citizen", autoComplete: "name" })}
              {field("address", "Street address", { placeholder: "12 Farm Road", autoComplete: "street-address" })}
              <div className="grid gap-5 sm:grid-cols-2">
                {field("city", "Suburb / town", { placeholder: "Ballarat", autoComplete: "address-level2" })}
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <select
                    id="state"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    autoComplete="address-level1"
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-[3px] focus:ring-ring/20"
                  >
                    {AU_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("zip", "Postcode", { placeholder: "3350", inputMode: "numeric", maxLength: 4, autoComplete: "postal-code" })}
                {field("phone", "Phone", { placeholder: "04XX XXX XXX", type: "tel", autoComplete: "tel" })}
              </div>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                disabled={!isAddressValid || unavailableItems.length > 0}
                onClick={goToStep2}
              >
                Continue to Shipping
                <ChevronRight className="h-4 w-4" />
              </button>
              {unavailableItems.length > 0 && (
                <p className="text-sm text-destructive">
                  Some items are no longer available.{" "}
                  <Link href="/cart" className="font-semibold underline">
                    Review your cart
                  </Link>
                </p>
              )}
            </div>
          </StepPanel>

          <StepPanel
            num={2}
            title="Delivery options"
            current={step}
            onEdit={() => setStep(2)}
            summary={
              <ul className="space-y-0.5">
                {vendorIds.map((vendorId) => {
                  const option = selectedOption(vendorId)
                  return (
                    <li key={vendorId}>
                      <span className="text-foreground">{vendorName(vendorId)}:</span> {option?.name ?? "—"}
                      {option && <> · {option.isFree ? "Free" : formatCents(option.costCents ?? 0)}</>}
                    </li>
                  )
                })}
              </ul>
            }
          >
            {loadingShipping ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-8">
                <p className="text-sm text-muted-foreground">
                  Each farm sends its own items. Choose how you&apos;d like to receive each part of your order.
                </p>
                {vendorIds.map((vendorId) => {
                  const vendorData = vendorShippingOptions[vendorId]
                  const vendorItems = itemsByVendor[vendorId] || []
                  const vendorSubtotal = vendorItems.reduce(
                    (sum, item) => sum + item.priceCents * item.quantity,
                    0
                  )

                  return (
                    <div key={vendorId} className="space-y-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-semibold">{vendorName(vendorId)}</h3>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {vendorItems.reduce((n, i) => n + i.quantity, 0)} items · {formatCents(vendorSubtotal)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {vendorItems.map((item) => `${item.name} (${item.variantLabel}) ×${item.quantity}`).join(", ")}
                      </p>

                      {!vendorData || vendorData.options.length === 0 ? (
                        <p className="rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                          This farm has no delivery options available right now. Remove its items from your cart to
                          continue, or contact the farm directly.
                        </p>
                      ) : (
                        <RadioGroup
                          value={shippingSelections[vendorId] || ""}
                          onValueChange={(val) =>
                            setShippingSelections((prev) => ({
                              ...prev,
                              [vendorId]: val,
                            }))
                          }
                          className="gap-2"
                        >
                          {vendorData.options.map((option) => {
                            const isUnavailable = option.available === false
                            const isPickup = option.type === "PICKUP"
                            const Icon = isPickup ? Store : Truck
                            const selected = shippingSelections[vendorId] === option.id
                            return (
                              <label
                                key={option.id}
                                className={cn(
                                  "flex items-center gap-3 rounded-md border p-3.5 transition-colors",
                                  isUnavailable
                                    ? "cursor-not-allowed opacity-50"
                                    : "cursor-pointer hover:border-foreground/30",
                                  selected && "border-primary bg-primary/[0.04] ring-1 ring-primary"
                                )}
                              >
                                <RadioGroupItem value={option.id} disabled={isUnavailable} />
                                <Icon className="h-4 w-4 shrink-0 text-olive" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold">{option.name}</span>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                                      {isUnavailable ? (
                                        "Unavailable"
                                      ) : option.isFree ? (
                                        <span className="text-olive">FREE</span>
                                      ) : (
                                        formatCents(option.costCents ?? 0)
                                      )}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {isUnavailable
                                      ? option.unavailableReason
                                      : isPickup
                                        ? option.description || option.estimatedDays
                                        : option.estimatedDays}
                                    {!isUnavailable &&
                                      !isPickup &&
                                      option.description &&
                                      ` — ${option.description}`}
                                  </p>
                                  {!isUnavailable &&
                                    !isPickup &&
                                    option.minOrderCents &&
                                    !option.isFree && (
                                      <p className="text-xs text-olive">
                                        Free on orders over {formatCents(option.minOrderCents)} from this farm
                                      </p>
                                    )}
                                </div>
                              </label>
                            )
                          })}
                        </RadioGroup>
                      )}
                    </div>
                  )
                })}

                {error && (
                  <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-md border px-5 text-sm font-semibold hover:bg-secondary"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    disabled={!isShippingValid || loadingPayment || loadingShipping}
                    onClick={goToStep3}
                  >
                    {loadingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continue to Payment
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </StepPanel>

          <StepPanel num={3} title="Payment" current={step}>
            {clientSecret ? (
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
                      borderRadius: "6px",
                    },
                  },
                }}
              >
                <PaymentForm
                  clientSecret={clientSecret}
                  shippingAddress={address}
                  shippingSelections={Object.entries(
                    shippingSelections
                  ).map(([vendorId, shippingOptionId]) => ({
                    vendorId,
                    shippingOptionId,
                  }))}
                  onOrderPlaced={() => {
                    orderPlacedRef.current = true
                  }}
                  totalCents={grandTotal}
                />
              </Elements>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-md border text-sm font-semibold hover:bg-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Shipping
            </button>
          </StepPanel>
        </div>

        {/* Right: Order Summary */}
        <aside className="lg:col-span-5">
          <div className="rounded-lg border bg-card lg:sticky lg:top-32" aria-label="Order summary">
            <div className="flex items-baseline justify-between border-b px-5 py-4 sm:px-6">
              <h2 className="font-serif text-xl font-medium">
                Order summary <span className="text-muted-foreground">({totalItems})</span>
              </h2>
              {step < 3 && (
                <Link href="/cart" className="text-sm font-semibold text-primary hover:underline">
                  Edit cart
                </Link>
              )}
            </div>
            <div className="max-h-[50vh] divide-y overflow-y-auto">
              {vendorIds.map((vendorId) => {
                const option = selectedOption(vendorId)
                return (
                  <div key={vendorId} className="space-y-4 px-5 py-4 sm:px-6">
                    <p className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-bold uppercase tracking-[0.12em] text-olive">{vendorName(vendorId)}</span>
                      {step >= 2 && option && (
                        <span className="text-muted-foreground">
                          {option.name} · {option.isFree ? "Free" : formatCents(option.costCents ?? 0)}
                        </span>
                      )}
                    </p>
                    {itemsByVendor[vendorId].map((item) => (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeItem}
                        compact
                        readOnly
                      />
                    ))}
                  </div>
                )
              })}
            </div>
            <dl className="space-y-2.5 border-t px-5 py-4 text-sm sm:px-6">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatCents(productSubtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Delivery{vendorIds.length > 1 && step >= 2 ? ` (${vendorIds.length} farms)` : ""}
                </dt>
                <dd className="tabular-nums">
                  {step >= 2 && shippingCost > 0
                    ? formatCents(shippingCost)
                    : step >= 2
                      ? "FREE"
                      : "Calculated next"}
                </dd>
              </div>
              <div className="flex justify-between border-t pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCents(grandTotal)}</dd>
              </div>
              <p className="text-xs text-muted-foreground">Charged in AUD in a single payment.</p>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
