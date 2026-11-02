import type { Metadata } from "next"
import { AuthLayout } from "@/components/auth-layout"
import { LoginForm } from "@/components/auth/login-form"
import { safeCallbackUrl } from "@/lib/auth-redirect"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to FarmMarket to check on orders, buy again and review what you've bought.",
  alternates: { canonical: "/login" },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const { callbackUrl } = await searchParams
  return (
    <AuthLayout panel="sign-in">
      <LoginForm callbackUrl={safeCallbackUrl(callbackUrl)} />
    </AuthLayout>
  )
}
