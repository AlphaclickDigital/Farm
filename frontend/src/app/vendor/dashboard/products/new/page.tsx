"use client"

import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ImagePlus, X, Loader2, Tag, Plus, Trash2, Send, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
  createProductSchema,
  type CreateProductValues,
  dollarsToCents,
} from "@/lib/validators/create-product"
import toast from "react-hot-toast"

interface Category {
  id: string
  name: string
  slug: string
}

const BASE_UNITS = [
  { value: "gram", label: "Gram (g)" },
  { value: "ml", label: "Millilitre (ml)" },
  { value: "piece", label: "Piece" },
]

export default function NewProductPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [showDiscount, setShowDiscount] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateProductValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: "",
      description: "",
      baseUnit: "",
      stockAmount: 0,
      categoryId: "",
      variants: [{ label: "", unitAmount: 1, price: "", weightGrams: undefined }],
      imageUrls: [],
      discountName: "",
      discountPrice: "",
      discountEndsAt: "",
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  })

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/categories`
        )
        if (res.ok) {
          const data = await res.json()
          setCategories(data)
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err)
      }
    }
    fetchCategories()
  }, [])

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return

    setUploading(true)
    const uploads = Array.from(files).map((file) => uploadToCloudinary(file))
    const results = await Promise.all(uploads)
    const urls = results.filter((url): url is string => url !== null)

    setImageUrls((prev) => {
      const updated = [...prev, ...urls]
      setValue("imageUrls", updated)
      return updated
    })
    setUploading(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function removeImage(index: number) {
    setImageUrls((prev) => {
      const updated = prev.filter((_, i) => i !== index)
      setValue("imageUrls", updated)
      return updated
    })
  }

  async function submitProduct(data: CreateProductValues, publish: boolean) {
    setIsSubmitting(true)
    setError("")

    const body: Record<string, unknown> = {
      name: data.name,
      description: data.description || undefined,
      baseUnit: data.baseUnit,
      stockAmount: data.stockAmount,
      categoryId: data.categoryId,
      isActive: publish,
      variants: data.variants.map((v) => ({
        label: v.label,
        unitAmount: v.unitAmount,
        priceCents: dollarsToCents(v.price),
        weightGrams: v.weightGrams,
      })),
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    }

    if (showDiscount && data.discountName && data.discountPrice) {
      body.discountName = data.discountName
      body.discountCents = dollarsToCents(data.discountPrice)
      if (data.discountEndsAt) {
        body.discountEndsAt = new Date(data.discountEndsAt).toISOString()
      }
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/products`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.user?.accessToken}`,
          },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        const resBody = await res.json().catch(() => null)
        throw new Error(resBody?.message || "Failed to create product")
      }

      toast.success(publish ? "Product published!" : "Draft saved!")
      router.push("/vendor/dashboard/products")
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong"
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Add New Product</CardTitle>
          <CardDescription>
            Fill in the details below to list a new product on the marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((data) => submitProduct(data, true))} className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Product Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Product Name</Label>
              <Input
                id="name"
                placeholder="e.g. Organic Chicken"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your product..."
                rows={3}
                {...register("description")}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                onValueChange={(value) => setValue("categoryId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && (
                <p className="text-sm text-destructive">
                  {errors.categoryId.message}
                </p>
              )}
            </div>

            {/* Base Unit and Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Unit</Label>
                <Select
                  onValueChange={(value) => setValue("baseUnit", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select base unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.baseUnit && (
                  <p className="text-sm text-destructive">
                    {errors.baseUnit.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stockAmount">Stock (in base units)</Label>
                <Input
                  id="stockAmount"
                  type="number"
                  placeholder="e.g. 50000 for 50kg"
                  {...register("stockAmount", { valueAsNumber: true })}
                />
                {errors.stockAmount && (
                  <p className="text-sm text-destructive">
                    {errors.stockAmount.message}
                  </p>
                )}
              </div>
            </div>

            {/* Variants */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Sell Variants</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({ label: "", unitAmount: 1, price: "", weightGrams: undefined })
                  }
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Variant
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Define how customers can buy this product. Each variant uses a
                certain amount of your base stock.
              </p>

              {errors.variants?.root && (
                <p className="text-sm text-destructive">
                  {errors.variants.root.message}
                </p>
              )}

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs">Label</Label>
                          <Input
                            placeholder="e.g. 500g Pack"
                            {...register(`variants.${index}.label`)}
                          />
                          {errors.variants?.[index]?.label && (
                            <p className="text-xs text-destructive">
                              {errors.variants[index].label.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Base Units Used</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 500"
                            {...register(`variants.${index}.unitAmount`, {
                              valueAsNumber: true,
                            })}
                          />
                          {errors.variants?.[index]?.unitAmount && (
                            <p className="text-xs text-destructive">
                              {errors.variants[index].unitAmount.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Price</Label>
                          <InputGroup>
                            <InputGroupAddon>
                              <InputGroupText>$</InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput
                              placeholder="0.00"
                              inputMode="decimal"
                              {...register(`variants.${index}.price`)}
                            />
                          </InputGroup>
                          {errors.variants?.[index]?.price && (
                            <p className="text-xs text-destructive">
                              {errors.variants[index].price.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Weight (grams)</Label>
                          <Input
                            type="number"
                            min="0"
                            placeholder="e.g. 250 (optional)"
                            {...register(`variants.${index}.weightGrams`, {
                              setValueAs: (v) =>
                                v === "" || v === null || Number.isNaN(Number(v))
                                  ? undefined
                                  : parseInt(v, 10),
                            })}
                          />
                          {errors.variants?.[index]?.weightGrams && (
                            <p className="text-xs text-destructive">
                              {errors.variants[index].weightGrams.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Weight is used for weight-based shipping calculations.
                      </p>
                    </div>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-5 text-destructive hover:text-destructive/80"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label>Product Images</Label>
              <div className="flex flex-wrap gap-3">
                {imageUrls.map((url, i) => (
                  <div
                    key={i}
                    className="relative h-24 w-24 overflow-hidden rounded-md border"
                  >
                    <img
                      src={url}
                      alt={`Product image ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-md border-2 border-dashed border-input text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <ImagePlus className="h-6 w-6" />
                  )}
                  <span className="mt-1 text-xs">
                    {uploading ? "Uploading..." : "Upload"}
                  </span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">
                Click the upload button to select images from your device.
              </p>
            </div>

            {/* Discount Section */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowDiscount(!showDiscount)}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
              >
                <Tag className="h-4 w-4" />
                {showDiscount ? "Remove Discount" : "Add Discount"}
              </button>

              {showDiscount && (
                <div className="space-y-4 rounded-md border border-primary/20 bg-primary/5 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="discountName">Discount Name</Label>
                    <Input
                      id="discountName"
                      placeholder="e.g. Summer Sale, Early Bird"
                      {...register("discountName")}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Discount Price</Label>
                      <InputGroup>
                        <InputGroupAddon>
                          <InputGroupText>$</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          placeholder="0.00"
                          inputMode="decimal"
                          {...register("discountPrice")}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>USD</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      {errors.discountPrice && (
                        <p className="text-sm text-destructive">
                          {errors.discountPrice.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="discountEndsAt">Discount Ends At</Label>
                      <Input
                        id="discountEndsAt"
                        type="datetime-local"
                        {...register("discountEndsAt")}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? "Publishing..." : "Publish"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={handleSubmit((data) => submitProduct(data, false))}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Save Draft
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/vendor/dashboard/products")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
