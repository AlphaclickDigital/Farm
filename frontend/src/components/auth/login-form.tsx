"use client"

import { useState } from "react"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { loginSchema, type LoginValues } from "@/lib/validators/auth"
import { callbackContext, withCallback } from "@/lib/auth-redirect"
import { AuthHeading, AuthInput, FormAlert, OrDivider, PasswordInput, SubmitButton } from "@/components/auth/auth-form-parts"

const DESCRIPTIONS = {
  checkout: "Sign in to finish checking out. Your cart is saved.",
  seller: "Sign in to start your application to sell on FarmMarket.",
  account: "Sign in to see your orders and account.",
  default: "Sign in to check on orders, buy again and review what you've bought.",
} as const

/** `callbackUrl` has already been checked by safeCallbackUrl on the server. */
export function LoginForm({ callbackUrl }: { callbackUrl: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(data: LoginValues) {
    setError(null)
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    if (result?.error) {
      setError(
        result.error === "CredentialsSignin"
          ? "Invalid email or password"
          : "We couldn't sign you in just now. Please try again in a moment."
      )
      return
    }

    setRedirecting(true)

    // Fetch the fresh session to send each role to its home.
    const session = await fetch("/api/auth/session").then((res) => res.json()).catch(() => null)
    const role = session?.user?.role
    const target = callbackUrl ?? (role === "ADMIN" ? "/admin" : role === "VENDOR" ? "/vendor/dashboard" : "/")

    // A full page load, not router.push + router.refresh: signing in changes the
    // header, the session provider and every cached server component at once.
    // Racing a push against a refresh while the layout switches from this
    // focused page to the storefront chrome made React fail with a removeChild
    // error, and a fresh load is what NextAuth's own redirect does anyway.
    window.location.assign(target)
  }

  const context = callbackContext(callbackUrl)

  return (
    <>
      <AuthHeading title="Welcome back" description={DESCRIPTIONS[context ?? "default"]} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {error && <FormAlert>{error}</FormAlert>}
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
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput autoComplete="current-password" placeholder="********" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1">
            <SubmitButton pending={form.formState.isSubmitting || redirecting} pendingLabel="Signing in…">
              Sign In
            </SubmitButton>
          </div>
        </form>
      </Form>

      <OrDivider>New to FarmMarket?</OrDivider>
      <Button asChild variant="outline" size="lg" className="h-11 w-full rounded-lg bg-card text-[15px] font-semibold">
        <Link href={withCallback("/register", callbackUrl)}>Create an account</Link>
      </Button>
    </>
  )
}
