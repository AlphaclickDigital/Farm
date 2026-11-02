"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useParams } from "next/navigation"
import { Loader2, Truck, MapPin, Pencil, Undo2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { formatCents, formatDate } from "@/lib/format"
import toast from "react-hot-toast"

// Mirrors the backend's allowed vendor transitions (orders.service.ts).
// Cancelling refunds the customer; REFUNDED goes through the Refund button.
const NEXT_STATUSES: Record<string, string[]> = {
  PAID: ["PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "COMPLETED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
}

export default function VendorOrderDetailPage() {
  const { data: session } = useSession()
  const params = useParams()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [trackingUrl, setTrackingUrl] = useState("")
  const [updatingTracking, setUpdatingTracking] = useState(false)
  const [editingTracking, setEditingTracking] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [addrName, setAddrName] = useState("")
  const [addrLine, setAddrLine] = useState("")
  const [addrCity, setAddrCity] = useState("")
  const [addrState, setAddrState] = useState("")
  const [addrZip, setAddrZip] = useState("")
  const [addrPhone, setAddrPhone] = useState("")
  const [savingAddress, setSavingAddress] = useState(false)

  const fetchOrder = async () => {
    if (!session?.user?.accessToken) {
      setLoading(false)
      return
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/orders/vendor/orders/${params.id}`,
        {
          headers: {
            Authorization: `Bearer ${session.user.accessToken}`,
          },
        }
      )

      if (res.ok) {
        const data = await res.json()
        setOrder(data)
      }
    } catch (err) {
      console.error("Failed to fetch order:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrder()
  }, [session, params.id])

  const handleStatusChange = async (newStatus: string) => {
    if (!session?.user?.accessToken || newStatus === order?.status) return
    if (
      newStatus === "CANCELLED" &&
      !confirm(
        "Cancel this order? The customer will be refunded via Stripe for your part of the order and the stock will be restored. This cannot be undone."
      )
    ) {
      return
    }

    setUpdating(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/orders/vendor/orders/${params.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.user.accessToken}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      )

      if (res.ok) {
        toast.success(newStatus === "CANCELLED" ? "Order cancelled and refunded" : "Order status updated!")
        await fetchOrder()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to update status")
      }
    } catch (err) {
      toast.error("Failed to update status")
    } finally {
      setUpdating(false)
    }
  }

  const handleUpdateTracking = async () => {
    if (!session?.user?.accessToken || !trackingNumber.trim()) return

    setUpdatingTracking(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/orders/vendor/orders/${params.id}/tracking`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.user.accessToken}`,
          },
          body: JSON.stringify({
            trackingNumber: trackingNumber.trim(),
            trackingUrl: trackingUrl.trim() || undefined,
          }),
        }
      )

      if (res.ok) {
        toast.success(editingTracking ? "Tracking updated!" : "Tracking info added & order marked as shipped!")
        setEditingTracking(false)
        await fetchOrder()
        setTrackingNumber("")
        setTrackingUrl("")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to update tracking")
      }
    } catch (err) {
      toast.error("Failed to update tracking")
    } finally {
      setUpdatingTracking(false)
    }
  }

  const handleRefund = async () => {
    if (!session?.user?.accessToken) return
    if (
      !confirm(
        "Refund this order? This will refund the customer via Stripe and restore stock. This cannot be undone."
      )
    ) {
      return
    }

    setRefunding(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/orders/vendor/orders/${params.id}/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.user.accessToken}`,
          },
        }
      )

      if (res.ok) {
        toast.success("Order refunded")
        await fetchOrder()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to refund order")
      }
    } catch {
      toast.error("Failed to refund order")
    } finally {
      setRefunding(false)
    }
  }

  const openAddressEdit = () => {
    setAddrName(order?.order.shippingName || "")
    setAddrLine(order?.order.shippingAddress || "")
    setAddrCity(order?.order.shippingCity || "")
    setAddrState(order?.order.shippingState || "")
    setAddrZip(order?.order.shippingZip || "")
    setAddrPhone(order?.order.shippingPhone || "")
    setEditingAddress(true)
  }

  const handleUpdateAddress = async () => {
    if (!session?.user?.accessToken) return
    setSavingAddress(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/orders/vendor/orders/${params.id}/address`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.user.accessToken}`,
          },
          body: JSON.stringify({
            shippingName: addrName,
            shippingAddress: addrLine,
            shippingCity: addrCity,
            shippingState: addrState,
            shippingZip: addrZip,
            shippingPhone: addrPhone,
          }),
        }
      )
      if (res.ok) {
        toast.success("Shipping address updated!")
        setEditingAddress(false)
        await fetchOrder()
      } else {
        toast.error("Failed to update address")
      }
    } catch {
      toast.error("Failed to update address")
    } finally {
      setSavingAddress(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return <p className="text-center text-muted-foreground">Order not found</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </h1>
        <p className="text-muted-foreground">
          Placed on {formatDate(order.order.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Order items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items.map((item: any) => (
                  <div key={item.id} className="flex gap-4">
                    {item.product.images[0] && (
                      <img
                        src={item.product.images[0].url}
                        alt={item.product.name}
                        className="h-16 w-16 rounded object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.variant.label}
                      </p>
                      <p className="text-sm">
                        Qty: {item.quantity} × {formatCents(item.priceCents)}
                      </p>
                    </div>
                    <p className="font-bold">
                      {formatCents(item.priceCents * item.quantity)}
                    </p>
                  </div>
                ))}
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCents(order.subtotalCents)}</span>
                  </div>
                  {order.shippingCents > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Shipping ({order.shippingMethod})
                      </span>
                      <span>{formatCents(order.shippingCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Platform Commission</span>
                    <span>-{formatCents(order.commissionCents)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Your Payout</span>
                    <span className="text-primary">
                      {formatCents(order.payoutCents)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{order.order.user.name}</p>
              <p className="text-sm text-muted-foreground">
                {order.order.user.email}
              </p>
            </CardContent>
          </Card>

          {/* Shipping Address */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Shipping Address
                </CardTitle>
                {!editingAddress && (
                  <Button variant="ghost" size="sm" onClick={openAddressEdit}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingAddress ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="addrName">Full Name</Label>
                    <Input id="addrName" value={addrName} onChange={(e) => setAddrName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="addrLine">Address</Label>
                    <Input id="addrLine" value={addrLine} onChange={(e) => setAddrLine(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="addrCity">City</Label>
                      <Input id="addrCity" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="addrState">State</Label>
                      <Input id="addrState" value={addrState} onChange={(e) => setAddrState(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="addrZip">Postcode</Label>
                      <Input id="addrZip" value={addrZip} onChange={(e) => setAddrZip(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="addrPhone">Phone</Label>
                      <Input id="addrPhone" value={addrPhone} onChange={(e) => setAddrPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingAddress(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="flex-1" disabled={savingAddress} onClick={handleUpdateAddress}>
                      {savingAddress ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  {order.order.shippingName ? (
                    <>
                      <p className="font-medium">{order.order.shippingName}</p>
                      <p className="text-muted-foreground">{order.order.shippingAddress}</p>
                      <p className="text-muted-foreground">
                        {order.order.shippingCity}, {order.order.shippingState}{" "}
                        {order.order.shippingZip}
                      </p>
                      {order.order.shippingPhone && (
                        <p className="text-muted-foreground">{order.order.shippingPhone}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">No address on file.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={order.status}
                onValueChange={handleStatusChange}
                disabled={updating || !NEXT_STATUSES[order.status]}
              >
                <SelectTrigger aria-label="Order status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[order.status, ...(NEXT_STATUSES[order.status] ?? [])].map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!NEXT_STATUSES[order.status] && (
                <p className="text-xs text-muted-foreground">
                  This order is {order.status.toLowerCase()} and can no longer change status.
                </p>
              )}
              {updating && (
                <p className="text-sm text-muted-foreground">Updating...</p>
              )}
              {order.status !== "REFUNDED" && order.status !== "CANCELLED" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={handleRefund}
                  disabled={refunding}
                >
                  {refunding ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="mr-2 h-3 w-3" />
                  )}
                  Refund Order
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.trackingNumber && !editingTracking ? (
                <>
                  <div className="rounded-md bg-blue-50 p-3">
                    <p className="text-sm font-medium text-blue-900">
                      {order.trackingNumber}
                    </p>
                    {order.trackingUrl && (
                      <a
                        href={order.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View tracking
                      </a>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setTrackingNumber(order.trackingNumber)
                      setTrackingUrl(order.trackingUrl || "")
                      setEditingTracking(true)
                    }}
                  >
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit Tracking
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="trackingNumber">Tracking Number</Label>
                    <Input
                      id="trackingNumber"
                      placeholder="e.g. AP123456789AU"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trackingUrl">Tracking URL (optional)</Label>
                    <Input
                      id="trackingUrl"
                      placeholder="https://auspost.com.au/track/..."
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    {editingTracking && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setEditingTracking(false)
                          setTrackingNumber("")
                          setTrackingUrl("")
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      className="flex-1"
                      size="sm"
                      disabled={!trackingNumber.trim() || updatingTracking}
                      onClick={handleUpdateTracking}
                    >
                      {updatingTracking ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : null}
                      {editingTracking ? "Update Tracking" : "Add Tracking & Mark Shipped"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
