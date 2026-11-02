"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Loader2, Pencil } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { formatDate } from "@/lib/format"
import toast from "react-hot-toast"

interface Vendor {
  id: string
  storeName: string
  description: string | null
  isApproved: boolean
  isSuspended: boolean
  suspendedReason: string | null
  createdAt: string
  user: { id: string; name: string | null; email: string }
  _count: { products: number; orders: number }
}

export default function AdminVendorsPage() {
  const { data: session } = useSession()
  const [allVendors, setAllVendors] = useState<Vendor[]>([])
  const [pendingVendors, setPendingVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [editStoreName, setEditStoreName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [saving, setSaving] = useState(false)

  // Suspend dialog state
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [suspendingVendor, setSuspendingVendor] = useState<Vendor | null>(null)
  const [suspendReason, setSuspendReason] = useState("")

  const api = (path: string, options?: RequestInit) =>
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.user?.accessToken}`,
        ...options?.headers,
      },
    })

  const fetchData = async () => {
    if (!session?.user?.accessToken) {
      setLoading(false)
      return
    }

    try {
      const [allRes, pendingRes] = await Promise.all([
        api("/admin/vendors"),
        api("/admin/vendors/pending"),
      ])

      if (allRes.ok) setAllVendors(await allRes.json())
      if (pendingRes.ok) setPendingVendors(await pendingRes.json())
    } catch (err) {
      console.error("Failed to fetch vendors:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [session])

  const handleApprove = async (vendorId: string) => {
    try {
      const res = await api(`/admin/vendors/${vendorId}/approve`, {
        method: "POST",
      })
      if (res.ok) {
        toast.success("Vendor approved!")
        await fetchData()
      }
    } catch (err) {
      toast.error("Failed to approve vendor")
    }
  }

  const handleReject = async (vendorId: string) => {
    try {
      const res = await api(`/admin/vendors/${vendorId}/reject`, {
        method: "POST",
      })
      if (res.ok) {
        toast.success("Vendor rejected")
        await fetchData()
      }
    } catch (err) {
      toast.error("Failed to reject vendor")
    }
  }

  const openEditDialog = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setEditStoreName(vendor.storeName)
    setEditDescription(vendor.description || "")
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingVendor) return
    setSaving(true)

    try {
      const res = await api(`/admin/vendors/${editingVendor.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          storeName: editStoreName,
          description: editDescription,
        }),
      })

      if (res.ok) {
        setEditDialogOpen(false)
        toast.success("Vendor updated!")
        await fetchData()
      } else {
        toast.error("Failed to update vendor")
      }
    } catch (err) {
      toast.error("Failed to update vendor")
    } finally {
      setSaving(false)
    }
  }

  const openSuspendDialog = (vendor: Vendor) => {
    setSuspendingVendor(vendor)
    setSuspendReason("")
    setSuspendDialogOpen(true)
  }

  const handleSuspend = async () => {
    if (!suspendingVendor || !suspendReason.trim()) return
    setSaving(true)

    try {
      const res = await api(`/admin/vendors/${suspendingVendor.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason: suspendReason }),
      })

      if (res.ok) {
        setSuspendDialogOpen(false)
        toast.success("Vendor suspended")
        await fetchData()
      } else {
        toast.error("Failed to suspend vendor")
      }
    } catch (err) {
      toast.error("Failed to suspend vendor")
    } finally {
      setSaving(false)
    }
  }

  const handleUnsuspend = async (vendorId: string) => {
    try {
      const res = await api(`/admin/vendors/${vendorId}/unsuspend`, {
        method: "POST",
      })
      if (res.ok) {
        toast.success("Vendor unsuspended!")
        await fetchData()
      }
    } catch (err) {
      toast.error("Failed to unsuspend vendor")
    }
  }

  const getStatusBadge = (vendor: Vendor) => {
    if (vendor.isSuspended) {
      return <Badge variant="destructive">Suspended</Badge>
    }
    if (vendor.isApproved) {
      return <Badge variant="default">Approved</Badge>
    }
    return <Badge variant="secondary">Pending</Badge>
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
        <h1 className="text-3xl font-bold">Vendors</h1>
        <p className="text-muted-foreground">Manage vendor accounts</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingVendors.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            All Vendors ({allVendors.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingVendors.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  No pending vendors
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Store Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingVendors.map((vendor) => (
                        <TableRow key={vendor.id}>
                          <TableCell className="font-medium">
                            {vendor.storeName}
                          </TableCell>
                          <TableCell>{vendor.user.name}</TableCell>
                          <TableCell>{vendor.user.email}</TableCell>
                          <TableCell>{vendor._count.products}</TableCell>
                          <TableCell>{formatDate(vendor.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(vendor.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleReject(vendor.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Vendors Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allVendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">
                          {vendor.storeName}
                        </TableCell>
                        <TableCell>{vendor.user.name}</TableCell>
                        <TableCell>{vendor.user.email}</TableCell>
                        <TableCell>
                          {getStatusBadge(vendor)}
                          {vendor.isSuspended && vendor.suspendedReason && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {vendor.suspendedReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{vendor._count.products}</TableCell>
                        <TableCell>{vendor._count.orders}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(vendor)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {vendor.isApproved && !vendor.isSuspended && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openSuspendDialog(vendor)}
                              >
                                Suspend
                              </Button>
                            )}
                            {vendor.isSuspended && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUnsuspend(vendor.id)}
                              >
                                Unsuspend
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Vendor Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">Store Name</Label>
              <Input
                id="storeName"
                value={editStoreName}
                onChange={(e) => setEditStoreName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Vendor Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Suspend Vendor: {suspendingVendor?.storeName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Suspending a vendor will hide their store and products from
              customers. The vendor will still be able to log in but cannot
              make sales.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for suspension</Label>
              <Textarea
                id="reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter the reason for suspending this vendor..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuspendDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSuspend}
              disabled={saving || !suspendReason.trim()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Suspend Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
