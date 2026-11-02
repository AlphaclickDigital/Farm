"use client"

import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ImagePlus, X, Store, Camera } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]

const settingsSchema = z.object({
  storeName: z.string().min(1, "Store name is required"),
  description: z.string().optional(),
  location: z.string().max(100, "Location is too long").optional(),
  state: z.string().optional(),
  phone: z
    .string()
    .regex(/^[0-9+()\s-]{8,20}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .optional(),
})

type SettingsValues = z.infer<typeof settingsSchema>

interface VendorProfile {
  id: string
  storeName: string
  description: string | null
  photo: string | null
  coverPhoto: string | null
  location: string | null
  state: string | null
  phone: string | null
}

function toFormValues(vendor: VendorProfile): SettingsValues {
  return {
    storeName: vendor.storeName,
    description: vendor.description || "",
    location: vendor.location || "",
    state: vendor.state || "",
    phone: vendor.phone || "",
  }
}

export default function VendorSettingsPage() {
  const { data: session } = useSession()
  const [vendor, setVendor] = useState<VendorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
  })

  useEffect(() => {
    async function fetchVendor() {
      if (!session?.user?.accessToken) return

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/vendors/me`,
          {
            headers: {
              Authorization: `Bearer ${session.user.accessToken}`,
            },
          }
        )
        if (res.ok) {
          const data = await res.json()
          setVendor(data)
          reset(toFormValues(data))
        }
      } catch (err) {
        console.error("Failed to fetch vendor:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchVendor()
  }, [session?.user?.accessToken, reset])

  async function uploadToCloudinary(file: File): Promise<string | null> {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "farm_marketplace"
    const formData = new FormData()
    formData.append("file", file)
    formData.append("upload_preset", uploadPreset)

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      )
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        console.error("Cloudinary error:", errData)
        throw new Error(errData?.error?.message || "Upload failed")
      }
      const data = await res.json()
      return data.secure_url as string
    } catch (err) {
      console.error("Cloudinary upload error:", err)
      return null
    }
  }

  async function updateVendorField(field: string, value: string) {
    if (!session?.user?.accessToken) return

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/vendors/me`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.user.accessToken}`,
        },
        body: JSON.stringify({ [field]: value }),
      }
    )

    if (!res.ok) {
      throw new Error("Failed to update")
    }

    return res.json()
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    setError("")
    try {
      const url = await uploadToCloudinary(file)
      if (!url) throw new Error("Upload failed")

      const updated = await updateVendorField("photo", url)
      setVendor(updated)
      setSuccess("Store photo updated")
      setTimeout(() => setSuccess(""), 3000)
    } catch {
      setError("Failed to upload photo")
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingCover(true)
    setError("")
    try {
      const url = await uploadToCloudinary(file)
      if (!url) throw new Error("Upload failed")

      const updated = await updateVendorField("coverPhoto", url)
      setVendor(updated)
      setSuccess("Cover photo updated")
      setTimeout(() => setSuccess(""), 3000)
    } catch {
      setError("Failed to upload cover photo")
    } finally {
      setUploadingCover(false)
      if (coverInputRef.current) coverInputRef.current.value = ""
    }
  }

  async function onSubmit(data: SettingsValues) {
    setSaving(true)
    setError("")
    setSuccess("")

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/vendors/me`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.user?.accessToken}`,
          },
          body: JSON.stringify(data),
        }
      )

      if (!res.ok) {
        const resBody = await res.json().catch(() => null)
        throw new Error(resBody?.message || "Failed to update settings")
      }

      const updated = await res.json()
      setVendor(updated)
      reset(toFormValues(updated))
      setSuccess("Settings saved successfully")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
    } finally {
      setSaving(false)
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
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your store profile and appearance.
        </p>
      </div>

      {success && (
        <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Cover Photo */}
      <Card>
        <CardHeader>
          <CardTitle>Cover Photo</CardTitle>
          <CardDescription>
            This banner appears at the top of your store page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {vendor?.coverPhoto ? (
              <div className="relative h-48 w-full overflow-hidden rounded-lg border">
                <img
                  src={vendor.coverPhoto}
                  alt="Cover"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateVendorField("coverPhoto", "").then((updated) => {
                      setVendor(updated)
                    })
                  }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="flex h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground disabled:opacity-50"
              >
                {uploadingCover ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <ImagePlus className="h-8 w-8" />
                )}
                <span className="mt-2 text-sm">
                  {uploadingCover ? "Uploading..." : "Upload cover photo"}
                </span>
              </button>
            )}
            {vendor?.coverPhoto && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
              >
                {uploadingCover ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                Change cover photo
              </Button>
            )}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverUpload}
          />
        </CardContent>
      </Card>

      {/* Store Photo */}
      <Card>
        <CardHeader>
          <CardTitle>Store Photo</CardTitle>
          <CardDescription>
            Your store&apos;s profile picture shown in listings and search results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {vendor?.photo ? (
              <div className="relative">
                <img
                  src={vendor.photo}
                  alt={vendor.storeName}
                  className="h-24 w-24 rounded-full object-cover border"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateVendorField("photo", "").then((updated) => {
                      setVendor(updated)
                    })
                  }}
                  className="absolute -right-1 -top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary">
                <Store className="h-10 w-10 text-primary" />
              </div>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                {vendor?.photo ? "Change photo" : "Upload photo"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Recommended: Square image, at least 200x200px
              </p>
            </div>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Store Details */}
      <Card>
        <CardHeader>
          <CardTitle>Store Details</CardTitle>
          <CardDescription>
            Update your store name and description.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="storeName">Store Name</Label>
              <Input
                id="storeName"
                placeholder="e.g. Green Valley Farm"
                {...register("storeName")}
              />
              {errors.storeName && (
                <p className="text-sm text-destructive">{errors.storeName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Tell customers about your store..."
                rows={4}
                {...register("description")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="location">Town / Region</Label>
                <Input
                  id="location"
                  placeholder="e.g. Yarra Valley"
                  {...register("location")}
                />
                {errors.location && (
                  <p className="text-sm text-destructive">{errors.location.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <select
                  id="state"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  {...register("state")}
                >
                  <option value="">Select...</option>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Contact Phone</Label>
              <Input
                id="phone"
                placeholder="e.g. (03) 5550 0101"
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <Button type="submit" disabled={saving || !isDirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
