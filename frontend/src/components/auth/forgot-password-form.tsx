"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators/auth"
import { AuthHeading, AuthInput, FormAlert, SubmitButton } from "@/components/auth/auth-form-parts"

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(data: ForgotPasswordValues) {
    setError(null)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError("Something went wrong. Please try again.")
        return
      }
      setSentTo(data.email)
    } catch {
      setError("Something went wrong. Please try again.")
    }
  }

  if (sentTo) {
    return (
      <>
        <AuthHeading
          icon={<MailCheck className="h-5 w-5" aria-hidden="true" />}
          title="Check your email"
          description={
            <>
              If there&apos;s a FarmMarket account for <span className="font-semibold text-foreground">{sentTo}</span>,
              we&apos;ve sent it a link to choose a new password. The link works for one hour.
            </>
          }
        />
        <div className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          Nothing after a few minutes? Check your spam or junk folder, or make sure you used the email you signed up
          with.
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild size="lg" className="h-11 w-full rounded-lg text-[15px] font-semibold">
            <Link href="/login">Back to sign in</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11 w-full rounded-lg text-[15px] font-semibold"
            onClick={() => {
              form.reset({ email: "" })
              setSentTo(null)
            }}
          >
            Use a different email
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <AuthHeading
        icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
        title="Forgot your password?"
        description="Enter the email you signed up with and we'll send you a link to choose a new one."
      />

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
          <div className="pt-1">
            <SubmitButton pending={form.formState.isSubmitting} pendingLabel="Sending…">
              Send reset link
            </SubmitButton>
          </div>
        </form>
      </Form>

      <p className="mt-7 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </p>
    </>
  )
}
