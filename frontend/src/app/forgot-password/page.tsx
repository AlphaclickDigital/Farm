import type { Metadata } from "next"
import { AuthLayout } from "@/components/auth-layout"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = {
  title: "Forgot your password",
  robots: { index: false },
}

export default function ForgotPasswordPage() {
  return (
    <AuthLayout panel="recover">
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
