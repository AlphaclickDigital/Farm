"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Loader2, Save, Percent, Banknote, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"

interface ConfigEntry {
  id: string
  key: string
  value: string
  description: string | null
  updatedAt: string
}

export default function AdminSettingsPage() {
  const { data: session } = useSession()
  const [configs, setConfigs] = useState<ConfigEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [commissionRate, setCommissionRate] = useState("")
  const [savingCommission, setSavingCommission] = useState(false)
  const [minPayoutAmount, setMinPayoutAmount] = useState("")
  const [savingMinPayout, setSavingMinPayout] = useState(false)
  const [featuredPrice, setFeaturedPrice] = useState("")
  const [featuredDuration, setFeaturedDuration] = useState("")
  const [savingFeatured, setSavingFeatured] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [savingConfig, setSavingConfig] = useState(false)

  const api = (path: string, options?: RequestInit) =>
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.user?.accessToken}`,
        ...options?.headers,
      },
    })

  const fetchConfig = async () => {
    try {
      const res = await api("/admin/configuration")
      if (res.ok) {
        const data: ConfigEntry[] = await res.json()
        setConfigs(data)
        const commission = data.find((c) => c.key === "commission_rate")
        if (commission) {
          const pct = parseFloat(commission.value) * 100
          setCommissionRate(String(pct))
        }
        const minPayout = data.find((c) => c.key === "min_payout_amount_cents")
        if (minPayout) {
          const dollars = parseInt(minPayout.value, 10) / 100
          setMinPayoutAmount(String(dollars))
        }
        const price = data.find((c) => c.key === "featured_listing_price_cents")
        if (price) {
          setFeaturedPrice(String(parseInt(price.value, 10) / 100))
        }
        const duration = data.find((c) => c.key === "featured_listing_duration_days")
        if (duration) {
          setFeaturedDuration(duration.value)
        }
      }
    } catch (err) {
      console.error("Failed to fetch configuration:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user?.accessToken) fetchConfig()
  }, [session])

  const handleSaveCommission = async () => {
    const pct = parseFloat(commissionRate)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Commission rate must be between 0 and 100")
      return
    }

    setSavingCommission(true)
    try {
      const res = await api("/admin/configuration/commission_rate", {
        method: "PATCH",
        body: JSON.stringify({
          value: String(pct / 100),
          description: "Platform commission rate",
        }),
      })

      if (res.ok) {
        toast.success("Commission rate updated!")
        await fetchConfig()
      } else {
        const data = await res.json()
        toast.error(data.message || "Failed to update commission rate")
      }
    } catch {
      toast.error("Failed to update commission rate")
    } finally {
      setSavingCommission(false)
    }
  }

  const handleSaveMinPayout = async () => {
    const dollars = parseFloat(minPayoutAmount)
    if (isNaN(dollars) || dollars < 0) {
      toast.error("Minimum payout amount must be a positive number")
      return
    }

    setSavingMinPayout(true)
    try {
      const res = await api("/admin/configuration/min_payout_amount_cents", {
        method: "PATCH",
        body: JSON.stringify({
          value: String(Math.round(dollars * 100)),
          description: "Minimum vendor balance (in cents) required before a payout can be requested",
        }),
      })

      if (res.ok) {
        toast.success("Minimum payout amount updated!")
        await fetchConfig()
      } else {
        const data = await res.json()
        toast.error(data.message || "Failed to update minimum payout amount")
      }
    } catch {
      toast.error("Failed to update minimum payout amount")
    } finally {
      setSavingMinPayout(false)
    }
  }

  const handleSaveFeatured = async () => {
    const dollars = parseFloat(featuredPrice)
    const days = parseInt(featuredDuration, 10)
    if (isNaN(dollars) || dollars < 0) {
      toast.error("Price must be a positive number")
      return
    }
    if (isNaN(days) || days < 1) {
      toast.error("Duration must be at least 1 day")
      return
    }

    setSavingFeatured(true)
    try {
      const [priceRes, durationRes] = await Promise.all([
        api("/admin/configuration/featured_listing_price_cents", {
          method: "PATCH",
          body: JSON.stringify({
            value: String(Math.round(dollars * 100)),
            description: "Price (in cents) for a featured product/store listing",
          }),
        }),
        api("/admin/configuration/featured_listing_duration_days", {
          method: "PATCH",
          body: JSON.stringify({
            value: String(days),
            description: "How many days a paid featured listing stays active",
          }),
        }),
      ])

      if (priceRes.ok && durationRes.ok) {
        toast.success("Featured listing settings updated!")
        await fetchConfig()
      } else {
        toast.error("Failed to update featured listing settings")
      }
    } catch {
      toast.error("Failed to update featured listing settings")
    } finally {
      setSavingFeatured(false)
    }
  }

  const handleSaveConfig = async (key: string) => {
    setSavingConfig(true)
    try {
      const res = await api(`/admin/configuration/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ value: editValue }),
      })

      if (res.ok) {
        setEditingKey(null)
        toast.success(`"${key}" updated!`)
        await fetchConfig()
      } else {
        const data = await res.json()
        toast.error(data.message || "Failed to update configuration")
      }
    } catch {
      toast.error("Failed to update configuration")
    } finally {
      setSavingConfig(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const otherConfigs = configs.filter(
    (c) =>
      ![
        "commission_rate",
        "min_payout_amount_cents",
        "featured_listing_price_cents",
        "featured_listing_duration_days",
      ].includes(c.key)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Platform configuration</p>
      </div>

      {/* Commission Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Commission Rate
          </CardTitle>
          <CardDescription>
            Percentage deducted from each vendor sale as platform commission
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="commission">Rate (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commission"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <Button onClick={handleSaveCommission} disabled={savingCommission}>
              {savingCommission ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Current rate: {commissionRate}% — For a $100 sale, the platform
            keeps ${(parseFloat(commissionRate || "0")).toFixed(2)} and the vendor
            receives ${(100 - parseFloat(commissionRate || "0")).toFixed(2)}
          </p>
        </CardContent>
      </Card>

      {/* Minimum Payout Amount */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Minimum Payout Amount
          </CardTitle>
          <CardDescription>
            Vendors must reach this balance before they can request a payout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="minPayout">Amount ($)</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="minPayout"
                  type="number"
                  min="0"
                  step="1"
                  value={minPayoutAmount}
                  onChange={(e) => setMinPayoutAmount(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <Button onClick={handleSaveMinPayout} disabled={savingMinPayout}>
              {savingMinPayout ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Vendors need at least ${(parseFloat(minPayoutAmount || "0")).toFixed(2)} in
            completed-order earnings before they can withdraw
          </p>
        </CardContent>
      </Card>

      {/* Featured Listings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Featured Listings
          </CardTitle>
          <CardDescription>
            Price and duration for vendors to pay for a featured product or store placement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="featuredPrice">Price ($)</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="featuredPrice"
                  type="number"
                  min="0"
                  step="1"
                  value={featuredPrice}
                  onChange={(e) => setFeaturedPrice(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="featuredDuration">Duration (days)</Label>
              <Input
                id="featuredDuration"
                type="number"
                min="1"
                step="1"
                value={featuredDuration}
                onChange={(e) => setFeaturedDuration(e.target.value)}
                className="w-28"
              />
            </div>
            <Button onClick={handleSaveFeatured} disabled={savingFeatured}>
              {savingFeatured ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Other Configuration */}
      {otherConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>General Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {otherConfigs.map((config) => (
                <div
                  key={config.key}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="flex-1">
                    <div className="font-mono text-sm font-medium">
                      {config.key}
                    </div>
                    {config.description && (
                      <div className="text-xs text-muted-foreground">
                        {config.description}
                      </div>
                    )}
                  </div>
                  {editingKey === config.key ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-48"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveConfig(config.key)}
                        disabled={savingConfig}
                      >
                        {savingConfig ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingKey(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">
                        {config.value}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingKey(config.key)
                          setEditValue(config.value)
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
