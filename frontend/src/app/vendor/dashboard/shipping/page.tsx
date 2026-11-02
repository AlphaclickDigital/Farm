"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useForm, useFieldArray, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Store,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { formatCents } from "@/lib/format"
import {
  shippingOptionSchema,
  kgToGrams,
  gramsToKg,
  dollarsToCents,
} from "@/lib/validators/shipping-option"
import toast from "react-hot-toast"

type MethodType = "FLAT_RATE" | "WEIGHT_BASED" | "PICKUP"

interface WeightTier {
  id: string
  minGrams: number
  maxGrams: number | null
  priceCents: number
}

interface ShippingOption {
  id: string
  name: string
  description: string | null
  type: MethodType
  flatRateCents: number | null
  minOrderCents: number | null
  estimatedDays: string
  isActive: boolean
  weightTiers: WeightTier[]
}

interface ShippingFormValues {
  type: MethodType
  name: string
  description?: string
  estimatedDays: string
  flatRate?: string
  freeShippingThreshold?: string
  weightTiers: { upToKg?: string; price: string }[]
}

const METHOD_TYPE_LABELS: Record<MethodType, string> = {
  FLAT_RATE: "Flat Rate",
  WEIGHT_BASED: "Weight-Based",
  PICKUP: "Local Pickup",
}

const DEFAULT_VALUES: ShippingFormValues = {
  type: "FLAT_RATE",
  name: "",
  description: "",
  estimatedDays: "",
  flatRate: "",
  freeShippingThreshold: "",
  weightTiers: [{ upToKg: "", price: "" }],
}

export default function VendorShippingPage() {
  const { data: session } = useSession()
  const [options, setOptions] = useState<ShippingOption[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<ShippingOption | null>(null)
  const [saving, setSaving] = useState(false)

  const API = process.env.NEXT_PUBLIC_BACKEND_URL

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<ShippingFormValues>({
    resolver: zodResolver(shippingOptionSchema) as unknown as Resolver<ShippingFormValues>,
    defaultValues: DEFAULT_VALUES,
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "weightTiers",
  })

  const type = watch("type")

  async function fetchOptions() {
    try {
      const res = await fetch(`${API}/vendors/me/shipping`, {
        headers: { Authorization: `Bearer ${session?.user?.accessToken}` },
      })
      if (res.ok) {
        setOptions(await res.json())
      }
    } catch (err) {
      console.error("Failed to fetch shipping options:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) fetchOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  function handleTypeChange(value: string) {
    const nextType = value as MethodType
    setValue("type", nextType)
    if (nextType === "WEIGHT_BASED" && fields.length === 0) {
      setValue("weightTiers", [{ upToKg: "", price: "" }])
    }
  }

  function openEditDialog(option: ShippingOption) {
    setEditingOption(option)
    reset({
      type: option.type,
      name: option.name,
      description: option.description || "",
      estimatedDays: option.estimatedDays,
      flatRate:
        option.type === "FLAT_RATE" && option.flatRateCents != null
          ? (option.flatRateCents / 100).toString()
          : "",
      freeShippingThreshold: option.minOrderCents
        ? (option.minOrderCents / 100).toString()
        : "",
      weightTiers:
        option.type === "WEIGHT_BASED" && option.weightTiers.length > 0
          ? option.weightTiers.map((t) => ({
              upToKg: t.maxGrams != null ? gramsToKg(t.maxGrams) : "",
              price: (t.priceCents / 100).toString(),
            }))
          : [{ upToKg: "", price: "" }],
    })
    setDialogOpen(true)
  }

  function openCreateDialog() {
    setEditingOption(null)
    reset(DEFAULT_VALUES)
    setDialogOpen(true)
  }

  async function onSubmit(data: ShippingFormValues) {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: data.name,
        description: data.description || undefined,
        type: data.type,
        estimatedDays: data.estimatedDays,
      }

      if (data.type === "FLAT_RATE") {
        body.flatRateCents = dollarsToCents(data.flatRate || "0")
      }

      if (data.type === "WEIGHT_BASED") {
        body.weightTiers = data.weightTiers.map((tier) => ({
          maxGrams: tier.upToKg?.trim() ? kgToGrams(tier.upToKg) : undefined,
          priceCents: dollarsToCents(tier.price),
        }))
      }

      if (data.type !== "PICKUP" && data.freeShippingThreshold) {
        body.minOrderCents = dollarsToCents(data.freeShippingThreshold)
      }

      const url = editingOption
        ? `${API}/vendors/me/shipping/${editingOption.id}`
        : `${API}/vendors/me/shipping`

      const res = await fetch(url, {
        method: editingOption ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.user?.accessToken}`,
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setDialogOpen(false)
        toast.success(editingOption ? "Shipping option updated!" : "Shipping option created!")
        fetchOptions()
      } else {
        const errBody = await res.json().catch(() => ({}))
        toast.error(errBody.message || "Failed to save shipping option")
      }
    } catch (err) {
      toast.error("Failed to save shipping option")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${API}/vendors/me/shipping/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.user?.accessToken}` },
      })
      if (res.ok) {
        toast.success("Shipping option deleted!")
      } else {
        toast.error("Failed to delete shipping option")
      }
      fetchOptions()
    } catch (err) {
      toast.error("Failed to delete shipping option")
    }
  }

  async function handleToggleActive(option: ShippingOption) {
    try {
      await fetch(`${API}/vendors/me/shipping/${option.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.user?.accessToken}`,
        },
        body: JSON.stringify({ isActive: !option.isActive }),
      })
      fetchOptions()
    } catch (err) {
      console.error("Failed to toggle shipping option:", err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shipping Options</h1>
          <p className="text-muted-foreground">
            Configure shipping rates for your customers across Australia
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) reset(DEFAULT_VALUES)
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Shipping Option
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOption ? "Edit Shipping Option" : "New Shipping Option"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="type">Shipping Method Type</Label>
                <Select value={type} onValueChange={handleTypeChange}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT_RATE">Flat Rate</SelectItem>
                    <SelectItem value="WEIGHT_BASED">Weight-Based</SelectItem>
                    <SelectItem value="PICKUP">Local Pickup</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Standard Shipping"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">
                  {type === "PICKUP"
                    ? "Pickup Instructions"
                    : "Description (optional)"}
                </Label>
                <Textarea
                  id="description"
                  rows={type === "PICKUP" ? 3 : 2}
                  placeholder={
                    type === "PICKUP"
                      ? "e.g. Collect from 123 Farm Rd, Mon–Fri 9am–5pm"
                      : "e.g. Delivered via Australia Post"
                  }
                  {...register("description")}
                />
              </div>

              {type === "FLAT_RATE" && (
                <div className="space-y-2">
                  <Label htmlFor="flatRate">Flat Rate ($AUD)</Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="flatRate"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="9.95"
                      {...register("flatRate")}
                    />
                  </InputGroup>
                  {errors.flatRate && (
                    <p className="text-sm text-destructive">
                      {errors.flatRate.message as string}
                    </p>
                  )}
                </div>
              )}

              {type === "WEIGHT_BASED" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Weight Tiers</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ upToKg: "", price: "" })}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add Tier
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {fields.map((field, index) => {
                      const isLast = index === fields.length - 1
                      return (
                        <div key={field.id} className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Up To (kg)
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={
                                isLast ? "Unlimited (leave blank)" : "e.g. 1"
                              }
                              {...register(`weightTiers.${index}.upToKg`)}
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Price
                            </Label>
                            <InputGroup>
                              <InputGroupAddon>
                                <InputGroupText>$</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="5.00"
                                {...register(`weightTiers.${index}.price`)}
                              />
                            </InputGroup>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={fields.length <= 1}
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                  {errors.weightTiers && (
                    <p className="text-sm text-destructive">
                      {(errors.weightTiers as { message?: string }).message ||
                        "Check your weight tiers"}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="estimatedDays">
                  {type === "PICKUP" ? "Pickup Availability" : "Estimated Delivery"}
                </Label>
                <Input
                  id="estimatedDays"
                  placeholder={
                    type === "PICKUP"
                      ? "e.g. Ready within 1 business day"
                      : "3-5 business days"
                  }
                  {...register("estimatedDays")}
                />
                {errors.estimatedDays && (
                  <p className="text-sm text-destructive">
                    {errors.estimatedDays.message}
                  </p>
                )}
              </div>

              {type !== "PICKUP" && (
                <div className="space-y-2">
                  <Label htmlFor="freeShippingThreshold">
                    Free Shipping Threshold ($AUD, optional)
                  </Label>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="freeShippingThreshold"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 100 for free shipping over $100"
                      {...register("freeShippingThreshold")}
                    />
                  </InputGroup>
                  <p className="text-xs text-muted-foreground">
                    Leave empty for no free shipping. Customers with orders above
                    this amount get free shipping.
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingOption ? "Update" : "Create"} Shipping Option
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {options.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Truck className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-medium">No shipping options yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add shipping options so customers can get their orders delivered.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {options.map((option) => (
            <Card
              key={option.id}
              className={!option.isActive ? "opacity-60" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{option.name}</CardTitle>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        {METHOD_TYPE_LABELS[option.type]}
                      </span>
                    </div>
                    {option.description && (
                      <CardDescription>{option.description}</CardDescription>
                    )}
                  </div>
                  <Switch
                    checked={option.isActive}
                    onCheckedChange={() => handleToggleActive(option)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {option.type === "FLAT_RATE" && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Flat Rate</span>
                    <span className="font-medium">
                      {formatCents(option.flatRateCents ?? 0)}
                    </span>
                  </div>
                )}

                {option.type === "WEIGHT_BASED" && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Weight-based — {option.weightTiers.length}{" "}
                      {option.weightTiers.length === 1 ? "tier" : "tiers"}
                    </span>
                    <span className="font-medium">
                      From{" "}
                      {formatCents(
                        Math.min(...option.weightTiers.map((t) => t.priceCents))
                      )}
                    </span>
                  </div>
                )}

                {option.type === "PICKUP" && (
                  <div className="flex items-center gap-2 text-sm">
                    <Store className="h-4 w-4 text-primary" />
                    <span className="font-medium text-primary">
                      Free — Local Pickup
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {option.type === "PICKUP" ? "Availability" : "Estimated Delivery"}
                  </span>
                  <span>{option.estimatedDays}</span>
                </div>
                {option.type !== "PICKUP" && option.minOrderCents && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Free Shipping Over
                    </span>
                    <span className="font-medium text-primary">
                      {formatCents(option.minOrderCents)}
                    </span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(option)}
                  >
                    <Pencil className="mr-2 h-3 w-3" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete shipping option?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove &quot;{option.name}&quot;.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(option.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
