import type { Metadata } from "next"
import { AuthLayout } from "@/components/auth-layout"
import { RegisterForm } from "@/components/auth/register-form"
import { safeCallbackUrl } from "@/lib/auth-redirect"

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a FarmMarket account to order from independent Australian farms.",
  alternates: { canonical: "/register" },
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const { callbackUrl } = await searchParams
  return (
    <AuthLayout panel="register">
      <RegisterForm callbackUrl={safeCallbackUrl(callbackUrl)} />
    </AuthLayout>
  )
}
