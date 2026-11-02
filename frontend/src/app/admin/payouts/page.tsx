"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Loader2, RotateCw } from "lucide-react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCents, formatDateTime } from "@/lib/format"
import toast from "react-hot-toast"

interface Payout {
  id: string
  amountCents: number
  status: "PENDING" | "COMPLETED" | "FAILED"
  stripeTransferId: string | null
  initiatedBy: "VENDOR" | "ADMIN"
  createdAt: string
  vendor: { id: string; storeName: string }
  _count: { orders: number }
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
}

export default function AdminPayoutsPage() {
  const { data: session } = useSession()
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const fetchPayouts = async () => {
    if (!session?.user?.accessToken) return

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/payouts/admin`,
        {
          headers: {
            Authorization: `Bearer ${session.user.accessToken}`,
          },
        }
      )
      if (res.ok) setPayouts(await res.json())
    } catch (err) {
      console.error("Failed to fetch payouts:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayouts()
  }, [session])

  const handleRetry = async (payoutId: string) => {
    if (!session?.user?.accessToken) return
    setRetryingId(payoutId)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/payouts/admin/payout/${payoutId}/retry`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.user.accessToken}`,
          },
        }
      )
      if (res.ok) {
        toast.success("Payout retried")
        await fetchPayouts()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to retry payout")
      }
    } catch {
      toast.error("Failed to retry payout")
    } finally {
      setRetryingId(null)
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
          {payouts.length} total payouts across all vendors
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Payouts</CardTitle>
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
                    <TableHead>Vendor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Initiated By</TableHead>
                    <TableHead>Transfer ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="font-medium">
                        {payout.vendor.storeName}
                      </TableCell>
                      <TableCell>{formatCents(payout.amountCents)}</TableCell>
                      <TableCell>{payout._count.orders}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[payout.status] || "secondary"}>
                          {payout.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{payout.initiatedBy}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payout.stripeTransferId || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(payout.createdAt)}
                      </TableCell>
                      <TableCell>
                        {payout.status !== "COMPLETED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retryingId === payout.id}
                            onClick={() => handleRetry(payout.id)}
                          >
                            {retryingId === payout.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCw className="h-3 w-3" />
                            )}
                          </Button>
                        )}
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
