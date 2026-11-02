"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import toast from "react-hot-toast"
import { Check, KeyRound, LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validators/auth"
import { cn } from "@/lib/utils"
import { AuthHeading, FormAlert, PasswordInput, SubmitButton } from "@/components/auth/auth-form-parts"

const MIN_PASSWORD = 8

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })
  const password = useWatch({ control: form.control, name: "password" })
  const longEnough = password.length >= MIN_PASSWORD

  async function onSubmit(data: ResetPasswordValues) {
    setError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body.message === "string" ? body.message : "This reset link is invalid or has expired")
        return
      }
    } catch {
      setError("Something went wrong. Please try again.")
      return
    }

    setRedirecting(true)
    toast.success("Password reset! Please sign in.")
    router.push("/login")
  }

  if (!token) {
    return (
      <>
        <AuthHeading
          icon={<LinkIcon className="h-5 w-5" aria-hidden="true" />}
          title="This link doesn't work"
          description="The reset link is missing part of its address. Ask for a new one and use the button in the latest email."
        />
        <Button asChild size="lg" className="h-11 w-full rounded-lg text-[15px] font-semibold">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
        title="Choose a new password"
        description="You'll use it to sign in straight after this."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {error && (
            <FormAlert>
              {error.endsWith(".") ? error : `${error}.`}{" "}
              <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
                Request a new link
              </Link>
            </FormAlert>
          )}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="********" {...field} />
                </FormControl>
                {form.formState.errors.password ? (
                  <FormMessage />
                ) : (
                  <p
                    className={cn(
                      "flex items-center gap-1.5 text-sm transition-colors",
                      longEnough ? "text-olive" : "text-muted-foreground"
                    )}
                  >
                    <Check className={cn("h-3.5 w-3.5", longEnough ? "opacity-100" : "opacity-40")} aria-hidden="true" />
                    At least {MIN_PASSWORD} characters
                  </p>
                )}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1">
            <SubmitButton pending={form.formState.isSubmitting || redirecting} pendingLabel="Saving…">
              Reset password
            </SubmitButton>
          </div>
        </form>
      </Form>
    </>
  )
}
