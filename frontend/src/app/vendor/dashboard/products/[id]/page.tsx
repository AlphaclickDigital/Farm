"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Package,
  Tag,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCents } from "@/lib/format"

interface ProductVariant {
  id: string
  label: string
  unitAmount: number
  priceCents: number
  isActive: boolean
}

interface ProductImage {
  id: string
  url: string
}

interface ProductDetail {
  id: string
  name: string
  slug: string
  description: string | null
  baseUnit: string
  stockAmount: number
  isActive: boolean
  discountName: string | null
  discountCents: number | null
  discountEndsAt: string | null
  createdAt: string
  updatedAt: string
  category: { id: string; name: string }
  variants: ProductVariant[]
  images: ProductImage[]
}

export default function ProductDetailPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const productId = params.id as string

  useEffect(() => {
    async function fetchProduct() {
      if (!session?.user?.accessToken) return

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/products/${productId}`,
          {
            headers: {
              Authorization: `Bearer ${session.user.accessToken}`,
            },
          }
        )
        if (res.ok) {
          setProduct(await res.json())
        } else {
          router.push("/vendor/dashboard/products")
        }
      } catch (err) {
        console.error("Failed to fetch product:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchProduct()
  }, [session?.user?.accessToken, productId, router])

  async function togglePublish() {
    if (!product || !session?.user?.accessToken) return

    setToggling(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/products/${productId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.user.accessToken}`,
          },
          body: JSON.stringify({ isActive: !product.isActive }),
        }
      )
      if (res.ok) {
        const updated = await res.json()
        setProduct(updated)
      }
    } catch (err) {
      console.error("Failed to toggle status:", err)
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Product not found.
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/vendor/dashboard/products")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{product.name}</h2>
            <p className="text-sm text-muted-foreground">/{product.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={product.isActive ? "default" : "secondary"}>
            {product.isActive ? "Active" : "Draft"}
          </Badge>
          <Button
            variant={product.isActive ? "outline" : "default"}
            size="sm"
            disabled={toggling}
            onClick={togglePublish}
          >
            {toggling ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : product.isActive ? (
              <EyeOff className="mr-2 h-4 w-4" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {product.isActive ? "Unpublish" : "Publish"}
          </Button>
          <Link href={`/vendor/dashboard/products/${product.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Images */}
      {product.images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {product.images.map((img) => (
            <div
              key={img.id}
              className="h-32 w-32 overflow-hidden rounded-lg border"
            >
              <img
                src={img.url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* Details */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Stock & Unit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {product.stockAmount.toLocaleString()}{" "}
              <span className="text-base font-normal text-muted-foreground">
                {product.baseUnit}s
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Category: {product.category.name}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{product.variants.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {product.variants.length === 1
                ? "1 sell variant"
                : `${product.variants.length} sell variants`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {product.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{product.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Variants table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sell Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Label</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Base Units Used
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{v.label}</td>
                    <td className="px-4 py-2 text-right">
                      {v.unitAmount.toLocaleString()} {product.baseUnit}
                      {v.unitAmount !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCents(v.priceCents)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge
                        variant={v.isActive ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {v.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Discount */}
      {product.discountName && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{product.discountName}</p>
            {product.discountCents && (
              <p className="text-sm text-muted-foreground">
                Discount price: {formatCents(product.discountCents)}
              </p>
            )}
            {product.discountEndsAt && (
              <p className="text-sm text-muted-foreground">
                Ends:{" "}
                {new Date(product.discountEndsAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      <p className="text-xs text-muted-foreground">
        Created: {new Date(product.createdAt).toLocaleDateString()} | Last
        updated: {new Date(product.updatedAt).toLocaleDateString()}
      </p>
    </div>
  )
}
