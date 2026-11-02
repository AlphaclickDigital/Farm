"use client"

import Link from "next/link"
import { Minus, Plus, Trash2 } from "lucide-react"
import { SmartImage } from "@/components/storefront/smart-image"
import { formatCents } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CartItem } from "@/store/use-cart-store"

interface CartItemRowProps {
  item: CartItem
  onUpdateQuantity: (id: string, quantity: number) => void
  onRemove: (id: string) => void
  compact?: boolean
  /** Summary-only rows (checkout) show quantity as text. */
  readOnly?: boolean
}

export function CartItemRow({ item, onUpdateQuantity, onRemove, compact, readOnly }: CartItemRowProps) {
  const max = item.unitAmount ? Math.floor(item.stockAmount / item.unitAmount) : Infinity
  const atMax = item.quantity >= max
  const lineTotal = formatCents(item.priceCents * item.quantity)

  return (
    <div className={cn("flex gap-3.5", item.unavailable && "opacity-70")} data-cart-line={item.id}>
      <Link
        href={`/products/${item.productId}`}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-secondary",
          compact ? "h-16 w-16" : "h-20 w-20 sm:h-24 sm:w-24"
        )}
        tabIndex={-1}
        aria-hidden="true"
      >
        <SmartImage src={item.image} alt="" sizes="96px" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/products/${item.productId}`}
              className={cn("line-clamp-2 font-semibold leading-snug hover:text-primary", compact ? "text-sm" : "text-[15px]")}
            >
              {item.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.variantLabel}
              {!compact && <> · {formatCents(item.priceCents)} each</>}
            </p>
          </div>
          <p className={cn("shrink-0 font-semibold tabular-nums", compact ? "text-sm" : "text-[15px]")}>{lineTotal}</p>
        </div>

        {item.unavailable ? (
          <p className="mt-1.5 text-xs font-semibold text-destructive">No longer available — please remove it to check out.</p>
        ) : (
          !readOnly &&
          atMax &&
          Number.isFinite(max) && <p className="mt-1.5 text-xs text-terracotta">Only {max} available</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {readOnly ? (
            <span className="text-xs text-muted-foreground">Qty {item.quantity}</span>
          ) : (
            <div className="flex h-8 items-center rounded-full border bg-card">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1 || item.unavailable}
                aria-label={`Decrease quantity of ${item.name}`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {item.quantity}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                disabled={atMax || item.unavailable}
                aria-label={`Increase quantity of ${item.name}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {!readOnly && (
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {!compact && "Remove"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
