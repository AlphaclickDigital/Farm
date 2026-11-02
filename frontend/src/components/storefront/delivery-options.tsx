import { Store, Truck } from "lucide-react"
import { formatCents } from "@/lib/format"
import type { ShippingOptionPublic } from "@/lib/storefront"

export function describePrice(option: ShippingOptionPublic) {
  if (option.type === "PICKUP") return "Free"
  if (option.type === "WEIGHT_BASED") {
    const prices = option.weightTiers?.map((t) => t.priceCents) ?? []
    return prices.length ? `From ${formatCents(Math.min(...prices))}` : "By weight"
  }
  return option.flatRateCents ? formatCents(option.flatRateCents) : "Free"
}

/** A farm's published delivery and pickup options, exactly as checkout will offer them. */
export function DeliveryOptions({
  options,
  farmName,
  className,
}: {
  options: ShippingOptionPublic[] | null
  farmName: string
  className?: string
}) {
  return (
    <div className={className}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em]">Delivery &amp; pickup</h2>
      {!options || options.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {farmName} hasn&apos;t published delivery options yet. You&apos;ll see what&apos;s available at checkout.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-md border bg-card">
          {options.map((option) => {
            const Icon = option.type === "PICKUP" ? Store : Truck
            return (
              <li key={option.id} className="flex gap-3 px-4 py-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-olive" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{option.name}</span>
                    <span className="shrink-0 tabular-nums">{describePrice(option)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {option.type === "PICKUP" ? option.description || option.estimatedDays : option.estimatedDays}
                    {option.type !== "PICKUP" && option.minOrderCents ? (
                      <span className="text-olive"> · Free over {formatCents(option.minOrderCents)}</span>
                    ) : null}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        Sent by {farmName}, separately from other farms in your order. Delivery is charged per farm at checkout.
      </p>
    </div>
  )
}
