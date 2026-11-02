"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Boxes, Flame, Loader2, Package, PackageX, Search, Snail, TrendingUp } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiFetch, useAccessToken, useApi } from "@/lib/api"
import { formatBaseUnits, formatDateShort, formatNumber } from "@/lib/format"
import type { InventoryReport, InventoryRow } from "@/lib/dashboard-types"
import { useQueryState } from "@/hooks/use-query-state"
import { ExportButton } from "@/components/dashboard/export-button"
import { StockBadge } from "@/components/dashboard/status-badge"
import { EmptyState, ErrorState, PageHeader, Pagination, SectionCard, SegmentedControl, StatTile } from "@/components/dashboard/primitives"

const FILTERS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "demand", label: "High demand" },
  { value: "stale", label: "No recent sales" },
  { value: "inactive", label: "Hidden" },
] as const
type Filter = (typeof FILTERS)[number]["value"]

const PAGE_SIZE = 15

function matches(row: InventoryRow, filter: Filter) {
  switch (filter) {
    case "low":
      return row.state === "low"
    case "out":
      return row.state === "out"
    case "demand":
      return row.highDemand
    case "stale":
      return row.noRecentSales
    case "inactive":
      return !row.isActive
    default:
      return true
  }
}

const UNIT_NAME: Record<string, string> = { gram: "grams", ml: "millilitres", piece: "pieces" }

function Inventory() {
  const query = useQueryState()
  const filter = (query.get("filter") || "all") as Filter
  const page = Number(query.get("page")) || 1
  const [search, setSearch] = useState("")
  const [restocking, setRestocking] = useState<InventoryRow | null>(null)
  const inventory = useApi<InventoryReport>("/analytics/vendor/inventory")

  const rows = useMemo(() => {
    if (!inventory.data) return []
    const needle = search.trim().toLowerCase()
    const order = { out: 0, low: 1, in_stock: 2, inactive: 3 }
    return inventory.data.rows
      .filter((r) => matches(r, filter) && (!needle || r.name.toLowerCase().includes(needle)))
      .sort((a, b) => order[a.state] - order[b.state] || (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) || a.name.localeCompare(b.name))
  }, [inventory.data, filter, search])

  const summary = inventory.data?.summary
  const thresholds = inventory.data?.thresholds

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={
          thresholds
            ? `Stock is tracked per product in its own unit. "Low" means ${thresholds.lowSellableUnits} or fewer of the smallest pack left, or under ${thresholds.lowCoverDays} days of cover at the last 30 days' sales rate.`
            : "Stock levels, sales velocity and restock alerts."
        }
        actions={<ExportButton path="/analytics/vendor/export/inventory" label="Export" />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {summary ? (
          <>
            <StatTile label="Active products" value={formatNumber(summary.activeProducts)} sub={`${summary.inactive} hidden`} icon={Boxes} href="/vendor/dashboard/products" />
            <StatTile label="In stock" value={formatNumber(summary.inStock)} icon={Package} tone="good" />
            <StatTile label="Low stock" value={formatNumber(summary.lowStock)} icon={AlertTriangle} tone={summary.lowStock ? "warning" : "default"} />
            <StatTile label="Out of stock" value={formatNumber(summary.outOfStock)} icon={PackageX} tone={summary.outOfStock ? "critical" : "default"} />
            <StatTile label="High demand" value={formatNumber(summary.highDemand)} sub="Selling faster than usual" icon={Flame} tone={summary.highDemand ? "info" : "default"} />
            <StatTile label="No sales in 30 days" value={formatNumber(summary.noRecentSales)} icon={Snail} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        )}
      </div>

      <SectionCard contentClassName="p-0">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            ariaLabel="Inventory filter"
            value={filter}
            onChange={(value) => query.set({ filter: value === "all" ? null : value, page: null })}
            options={FILTERS.map((f) => ({
              value: f.value,
              label: f.label,
              count: inventory.data ? inventory.data.rows.filter((r) => matches(r, f.value)).length : undefined,
            }))}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                if (page !== 1) query.set({ page: null })
              }}
              placeholder="Search products…"
              className="h-8 pl-8 lg:w-56"
              aria-label="Search products"
            />
          </div>
        </div>

        {inventory.error && !inventory.data ? (
          <ErrorState message={inventory.error.message} onRetry={() => inventory.refetch()} />
        ) : !inventory.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={inventory.data.rows.length === 0 ? "No products yet" : "Nothing here"}
            description={inventory.data.rows.length === 0 ? "Add your first product to start tracking stock." : "No products match this filter."}
            action={
              inventory.data.rows.length === 0 ? (
                <Button asChild size="sm">
                  <Link href="/vendor/dashboard/products/new">Add product</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Sold (30d)</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Days of cover</TableHead>
                  <TableHead className="hidden lg:table-cell">Last sold</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        {r.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt="" className="size-9 shrink-0 rounded-md border object-cover" />
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Package className="size-4 text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link href={`/vendor/dashboard/products/${r.productId}`} className="block max-w-56 truncate font-medium hover:underline">
                            {r.name}
                          </Link>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {r.category}
                            {r.highDemand && (
                              <span className="inline-flex items-center gap-0.5 text-info">
                                <TrendingUp className="size-3" /> high demand
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StockBadge state={r.state} />
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-medium tabular-nums">{formatBaseUnits(r.stockAmount, r.baseUnit)}</p>
                      {r.smallestVariant && (
                        <p className="text-[11px] text-muted-foreground">
                          {formatNumber(r.sellableUnits)} × {r.smallestVariant.label}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      <p className="tabular-nums">{formatBaseUnits(r.sold30dBaseUnits, r.baseUnit)}</p>
                      <p className="text-[11px] text-muted-foreground">{formatNumber(r.sold30dItems)} packs</p>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {r.daysOfCover === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={r.daysOfCover < (thresholds?.lowCoverDays ?? 7) ? "font-medium text-warning" : undefined}>
                          {r.daysOfCover > 365 ? "365+" : Math.max(0, Math.round(r.daysOfCover))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {r.lastSoldAt ? formatDateShort(r.lastSoldAt) : "Never"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button variant="outline" size="xs" onClick={() => setRestocking(r)}>
                        Update stock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="px-4 pb-4">
          <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={(p) => query.set({ page: p === 1 ? null : p })} />
        </div>
      </SectionCard>

      <RestockDialog row={restocking} onClose={() => setRestocking(null)} />
    </div>
  )
}

function RestockDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const token = useAccessToken()
  const queryClient = useQueryClient()
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)
  const amount = Number(value)
  const valid = value !== "" && Number.isInteger(amount) && amount >= 0

  useEffect(() => setValue(row ? String(row.stockAmount) : ""), [row])

  const save = async () => {
    if (!row || !valid) return
    setSaving(true)
    try {
      await apiFetch(`/products/${row.productId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ stockAmount: amount }),
      })
      toast.success(`Stock updated for ${row.name}`)
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[1] ?? "").startsWith("/analytics/vendor") })
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update stock")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update stock</DialogTitle>
          <DialogDescription>{row?.name}</DialogDescription>
        </DialogHeader>
        {row && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <Label htmlFor="stock-amount">Total stock on hand ({UNIT_NAME[row.baseUnit] ?? row.baseUnit})</Label>
            <Input id="stock-amount" type="number" min={0} step={1} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <p className="text-xs text-muted-foreground">
              Currently {formatBaseUnits(row.stockAmount, row.baseUnit)}.
              {valid && row.smallestVariant && (
                <> That&apos;s enough for {formatNumber(Math.floor(amount / row.smallestVariant.unitAmount))} × {row.smallestVariant.label}.</>
              )}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || saving}>
                {saving && <Loader2 className="animate-spin" />}
                Save stock
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <Inventory />
    </Suspense>
  )
}
