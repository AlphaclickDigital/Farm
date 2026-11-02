import { z } from "zod"
import { dollarsToCents } from "@/lib/validators/create-product"

export const SHIPPING_METHOD_TYPES = ["FLAT_RATE", "WEIGHT_BASED", "PICKUP"] as const

const isNonNegativeNumberString = (val: string) =>
  !isNaN(parseFloat(val)) && parseFloat(val) >= 0

export const weightTierSchema = z.object({
  upToKg: z.string().optional(), // blank permitted only on the last tier (checked in superRefine below)
  price: z
    .string()
    .min(1, "Price is required")
    .refine(isNonNegativeNumberString, "Must be zero or a positive number"),
})

const commonFields = {
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  estimatedDays: z.string().min(1, "This field is required"),
}

const freeShippingField = {
  freeShippingThreshold: z
    .string()
    .optional()
    .refine((v) => !v || isNonNegativeNumberString(v), "Must be a positive number"),
}

const flatRateSchema = z.object({
  type: z.literal("FLAT_RATE"),
  ...commonFields,
  ...freeShippingField,
  flatRate: z
    .string()
    .min(1, "Flat rate is required")
    .refine(isNonNegativeNumberString, "Must be zero or a positive number"),
})

const weightBasedSchema = z.object({
  type: z.literal("WEIGHT_BASED"),
  ...commonFields,
  ...freeShippingField,
  weightTiers: z.array(weightTierSchema).min(1, "At least one weight tier is required"),
})

const pickupSchema = z.object({
  type: z.literal("PICKUP"),
  ...commonFields,
})

export const shippingOptionSchema = z
  .discriminatedUnion("type", [flatRateSchema, weightBasedSchema, pickupSchema])
  .superRefine((data, ctx) => {
    if (data.type !== "WEIGHT_BASED") return
    data.weightTiers.forEach((tier, i) => {
      const isLast = i === data.weightTiers.length - 1
      const trimmed = tier.upToKg?.trim()
      if (!isLast && !trimmed) {
        ctx.addIssue({
          code: "custom",
          path: ["weightTiers", i, "upToKg"],
          message: "Required — only the last tier can be left open-ended",
        })
        return
      }
      if (trimmed) {
        const kg = parseFloat(trimmed)
        if (isNaN(kg) || kg <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["weightTiers", i, "upToKg"],
            message: "Must be a positive number",
          })
        } else if (i > 0) {
          const prev = data.weightTiers[i - 1].upToKg?.trim()
          if (prev && kg <= parseFloat(prev)) {
            ctx.addIssue({
              code: "custom",
              path: ["weightTiers", i, "upToKg"],
              message: "Must be greater than the previous tier",
            })
          }
        }
      }
    })
  })

export type ShippingOptionValues = z.infer<typeof shippingOptionSchema>

export function kgToGrams(kg: string): number {
  return Math.round(parseFloat(kg) * 1000)
}

export function gramsToKg(grams: number): string {
  return (grams / 1000).toString()
}

export { dollarsToCents }
