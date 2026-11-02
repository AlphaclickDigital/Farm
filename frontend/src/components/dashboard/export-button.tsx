"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { downloadCsv, qs, useAccessToken } from "@/lib/api"
import { useRangeParams } from "@/store/use-dashboard-range"

/** Downloads a server-generated CSV for the current date range. */
export function ExportButton({
  path,
  label = "Export CSV",
  params,
}: {
  path: string
  label?: string
  params?: Record<string, string | undefined>
}) {
  const token = useAccessToken()
  const range = useRangeParams()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await downloadCsv(`${path}${qs({ ...range, ...params })}`, token)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy || !token}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {label}
    </Button>
  )
}
