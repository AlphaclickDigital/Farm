"use client"

import { ColumnDef } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { formatCents } from "@/lib/format"

export type ProductVariant = {
  id: string
  label: string
  unitAmount: number
  priceCents: number
  isActive: boolean
}

export type Product = {
  id: string
  name: string
  baseUnit: string
  stockAmount: number
  isActive: boolean
  createdAt: string
  variants: ProductVariant[]
}

export const columns: ColumnDef<Product>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    id: "price",
    header: () => <div className="text-right">Price</div>,
    cell: ({ row }) => {
      const variants = row.original.variants
      if (!variants.length) return <div className="text-right">—</div>

      if (variants.length === 1) {
        return (
          <div className="text-right font-medium">
            {formatCents(variants[0].priceCents)}
          </div>
        )
      }

      const prices = variants.map((v) => v.priceCents)
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      return (
        <div className="text-right font-medium">
          {formatCents(min)} – {formatCents(max)}
        </div>
      )
    },
  },
  {
    id: "stock",
    header: "Stock",
    cell: ({ row }) => {
      const { stockAmount, baseUnit } = row.original
      return (
        <div>
          {stockAmount.toLocaleString()} {baseUnit}s
        </div>
      )
    },
  },
  {
    id: "variants",
    header: "Variants",
    cell: ({ row }) => {
      return <div>{row.original.variants.length}</div>
    },
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.getValue("isActive")
      return (
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "Active" : "Draft"}
        </Badge>
      )
    },
  },
  {
    id: "actions",
    cell: function ActionsCell({ row }) {
      const product = row.original
      const router = useRouter()

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(product.id)}
            >
              Copy product ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                router.push(`/vendor/dashboard/products/${product.id}`)
              }
            >
              View details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/vendor/dashboard/products/${product.id}/edit`)
              }
            >
              Edit product
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
