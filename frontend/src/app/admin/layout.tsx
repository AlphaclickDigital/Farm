import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session || session.user.role !== "ADMIN") {
    redirect("/")
  }

  return (
    <DashboardShell variant="admin" user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </DashboardShell>
  )
}
