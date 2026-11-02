"use client"

import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSession } from "next-auth/react"
import toast from "react-hot-toast"
import { Camera, LayoutDashboard, ShieldCheck, Truck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  vendorRegistrationSchema,
  type VendorRegistrationValues,
} from "@/lib/validators/vendor-registration"

const benefits = [
  {
    icon: Users,
    title: "Reach More Customers",
    description:
      "Get discovered by customers across Australia looking for fresh, local produce.",
  },
  {
    icon: LayoutDashboard,
    title: "Simple Store Management",
    description:
      "Manage products, orders, and shipping from an easy-to-use vendor dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Payments",
    description:
      "Get paid safely and reliably through secure Stripe payment processing.",
  },
  {
    icon: Truck,
    title: "You're in Control",
    description:
      "Set your own prices, stock levels, and shipping options — it's your store, your rules.",
  },
]

async function uploadToCloudinary(file: File): Promise<string | null> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset =
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "farm_marketplace"
  const formData = new FormData()
  formData.append("file", file)
  formData.append("upload_preset", uploadPreset)

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.secure_url as string
  } catch {
    return null
  }
}

export default function VendorOnboardingPage() {
  const { data: session } = useSession()
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<VendorRegistrationValues>({
    resolver: zodResolver(vendorRegistrationSchema),
    defaultValues: {
      storeName: "",
      description: "",
    },
  })

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function onSubmit(data: VendorRegistrationValues) {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/vendors/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.user?.accessToken}`,
          },
          body: JSON.stringify(data),
        }
      )

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.message || "Failed to register vendor")
      }

      if (photoFile) {
        const url = await uploadToCloudinary(photoFile)
        if (url) {
          await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/vendors/me`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.user?.accessToken}`,
            },
            body: JSON.stringify({ photo: url }),
          }).catch(() => null)
        }
      }

      toast.success("Store registered! Redirecting to your dashboard...")
      // Full reload so the session JWT refreshes with the new VENDOR role
      window.location.href = "/vendor/dashboard"
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      )
    }
  }

  return (
    <div className="bg-linear-to-b from-secondary/40 to-background">
      <div className="container mx-auto grid gap-12 px-4 py-16 lg:grid-cols-2 lg:items-center">
        {/* Marketing column */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
              Sell Your Harvest to Thousands of Aussies
            </h1>
            <p className="text-lg text-muted-foreground">
              Join a growing community of local farmers and producers
              reaching customers across Australia.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <benefit.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <img
            src="https://images.unsplash.com/photo-1594400316020-f357da8a2848?q=80&w=1200&auto=format&fit=crop"
            alt="A local farmer with fresh produce"
            className="hidden max-h-80 w-full rounded-2xl object-cover sm:block"
          />
        </div>

        {/* Form column */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              Create Your Store
            </CardTitle>
            <CardDescription>
              Start selling your farm products today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Store photo preview"
                      className="h-16 w-16 rounded-full border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                      <Camera className="h-6 w-6" />
                    </div>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {photoPreview ? "Change photo" : "Add store photo"}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional — you can add this later too.
                    </p>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="storeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Green Valley Farm" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is the name that will be displayed on your shop
                        page.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell customers what makes your farm special..."
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting
                    ? "Creating store..."
                    : "Create My Store"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Your store will be reviewed before going live.
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
