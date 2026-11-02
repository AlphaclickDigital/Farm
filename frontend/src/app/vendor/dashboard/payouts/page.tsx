"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { Loader2, CreditCard, CheckCircle2, Wallet } from "lucide-react"
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
import { formatCents, formatDateTime } from "@/lib/format"
import toast from "react-hot-toast"

interface StripeStatus {
  exists: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  onboardingComplete: boolean
}

interface Balance {
  availableCents: number
  minPayoutCents: number
  stripeConnected: boolean
  stripeOnboardingComplete: boolean
  eligible: boolean
  blockedReason: string | null
}

interface Payout {
  id: string
  amountCents: number
  status: "PENDING" | "COMPLETED" | "FAILED"
  stripeTransferId: string | null
  failureReason: string | null
  initiatedBy: "VENDOR" | "ADMIN"
  createdAt: string
  _count: { orders: number }
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
}

export default function VendorPayoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VendorPayoutsPageContent />
    </Suspense>
  )
}

function VendorPayoutsPageContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [requesting, setRequesting] = useState(false)

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
      const [statusRes, balanceRes, payoutsRes] = await Promise.all([
        api("/stripe/connect/status"),
        api("/payouts/me/balance"),
        api("/payouts/me"),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (balanceRes.ok) setBalance(await balanceRes.json())
      if (payoutsRes.ok) setPayouts(await payoutsRes.json())
    } catch (err) {
      console.error("Failed to fetch payout data:", err)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (session?.user?.accessToken) fetchAll()
  }, [session, fetchAll])

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Stripe account updated!")
    } else if (searchParams.get("refresh") === "true") {
      toast.error("Onboarding link expired — please try again")
    }
  }, [searchParams])

  const handleConnectStripe = async () => {
    setConnecting(true)
    try {
      if (!status?.exists) {
        const createRes = await api("/stripe/connect/account", { method: "POST" })
        if (!createRes.ok) {
          const data = await createRes.json()
          toast.error(data.message || "Failed to create Stripe account")
          setConnecting(false)
          return
        }
      }

      const linkRes = await api("/stripe/connect/account-link", { method: "POST" })
      if (linkRes.ok) {
        const { url } = await linkRes.json()
        window.location.href = url
      } else {
        const data = await linkRes.json()
        toast.error(data.message || "Failed to start onboarding")
        setConnecting(false)
      }
    } catch {
      toast.error("Failed to connect Stripe account")
      setConnecting(false)
    }
  }

  const handleRequestPayout = async () => {
    setRequesting(true)
    try {
      const res = await api("/payouts/me/request", { method: "POST" })
      if (res.ok) {
        toast.success("Payout requested!")
        await fetchAll()
      } else {
        const data = await res.json()
        toast.error(data.message || "Failed to request payout")
      }
    } catch {
      toast.error("Failed to request payout")
    } finally {
      setRequesting(false)
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
        <h1 className="text-3xl font-bold">Payouts</h1>
        <p className="text-muted-foreground">
          Connect Stripe to receive your earnings
        </p>
      </div>

      {/* Stripe Connect status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stripe Account
          </CardTitle>
          <CardDescription>
            Payouts are sent to your connected Stripe account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status?.onboardingComplete ? (
            <div className="flex items-center gap-2 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Connected
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {status?.exists
                  ? "Your Stripe onboarding is incomplete. Finish it to start receiving payouts."
                  : "You haven't connected a Stripe account yet."}
              </p>
              <Button onClick={handleConnectStripe} disabled={connecting}>
                {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {status?.exists ? "Continue Onboarding" : "Connect Stripe Account"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available balance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Available Balance
          </CardTitle>
          <CardDescription>
            From completed orders, minus platform commission
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-bold">
                {formatCents(balance?.availableCents || 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Minimum payout: {formatCents(balance?.minPayoutCents || 0)}
              </p>
            </div>
            <div className="text-right">
              <Button onClick={handleRequestPayout} disabled={!balance?.eligible || requesting}>
                {requesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request Payout
              </Button>
              {balance?.blockedReason && (
                <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                  {balance.blockedReason}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payout history */}
      <Card>
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No payouts yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transfer ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="text-sm">
                        {formatDateTime(payout.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCents(payout.amountCents)}
                      </TableCell>
                      <TableCell>{payout._count.orders}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[payout.status] || "secondary"}>
                          {payout.status}
                        </Badge>
                        {payout.status === "FAILED" && payout.failureReason && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {payout.failureReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payout.stripeTransferId || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
