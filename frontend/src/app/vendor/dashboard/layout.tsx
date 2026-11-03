import { auth } from "@/auth"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

// Role gating happens in src/proxy.ts (VENDOR only); this just supplies the shell.
export default async function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <DashboardShell variant="vendor" user={{ name: session?.user?.name, email: session?.user?.email }}>
      {children}
    </DashboardShell>
  )
}
