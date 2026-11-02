"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import toast from "react-hot-toast"
import { Check, Sprout } from "lucide-react"
import { useState } from "react"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { registerSchema, type RegisterValues } from "@/lib/validators/auth"
import { registerUser } from "@/app/actions/auth"
import { callbackContext, withCallback } from "@/lib/auth-redirect"
import { cn } from "@/lib/utils"
import { AuthHeading, AuthInput, FormAlert, PasswordInput, SubmitButton } from "@/components/auth/auth-form-parts"

const MIN_PASSWORD = 8

/** `callbackUrl` has already been checked by safeCallbackUrl on the server. */
export function RegisterForm({ callbackUrl }: { callbackUrl: string | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  })
  const password = useWatch({ control: form.control, name: "password" })
  const longEnough = password.length >= MIN_PASSWORD

  async function onSubmit(data: RegisterValues) {
    setError(null)
    try {
      const result = await registerUser({ name: data.name, email: data.email, password: data.password })
      if (result.error) {
        setError(result.error)
        return
      }
    } catch {
      setError("We couldn't create your account just now. Please try again in a moment.")
      return
    }

    setRedirecting(true)
    toast.success("Account created! Please sign in.")
    router.push(withCallback("/login", callbackUrl))
  }

  const seller = callbackContext(callbackUrl) === "seller"

  return (
    <>
      <AuthHeading
        title="Create your account"
        description={
          seller
            ? "Step one of selling on FarmMarket. Once you've signed in, you'll fill in your farm's details."
            : callbackContext(callbackUrl) === "checkout"
              ? "Create an account to finish checking out. Your cart is saved."
              : "Order from independent Australian farms, track every delivery and review what you buy."
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {error && <FormAlert>{error}</FormAlert>}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <AuthInput autoComplete="name" placeholder="Jane Citizen" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <AuthInput type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
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
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1">
            <SubmitButton pending={form.formState.isSubmitting || redirecting} pendingLabel="Creating your account…">
              Create account
            </SubmitButton>
          </div>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={withCallback("/login", callbackUrl)}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>

      {!seller && (
        <div className="mt-8 flex gap-3.5 rounded-xl border border-border bg-secondary/50 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-olive">
            <Sprout className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Grow or make food?</span> Create your account, then
            apply to sell your produce here.{" "}
            <Link
              href={withCallback("/register", "/vendor/onboarding")}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Sign up as a seller
            </Link>
          </p>
        </div>
      )}
    </>
  )
}
