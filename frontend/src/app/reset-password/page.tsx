import type { Metadata } from "next"
import { AuthLayout } from "@/components/auth-layout"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
  // The token in the URL must not leak to other sites through the Referer header.
  referrer: "no-referrer",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const { token } = await searchParams
  const value = Array.isArray(token) ? token[0] : token
  return (
    <AuthLayout panel="recover">
      <ResetPasswordForm token={value || null} />
    </AuthLayout>
  )
}
