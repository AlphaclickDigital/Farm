import { z } from "zod"

export const variantSchema = z.object({
  label: z.string().min(1, "Label is required"),
  unitAmount: z.number().int().min(1, "Unit amount must be at least 1"),
  price: z.string().min(1, "Price is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Price must be a positive number"
  ),
  weightGrams: z.number().int().min(0, "Weight cannot be negative").optional(),
})

export const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  baseUnit: z.string().min(1, "Base unit is required"),
  stockAmount: z.number().int().min(0, "Stock cannot be negative"),
  categoryId: z.string().min(1, "Please select a category"),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
  imageUrls: z.array(z.string().url()).optional(),
  discountName: z.string().optional(),
  discountPrice: z.string().optional().refine(
    (val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) > 0),
    "Discount price must be a positive number"
  ),
  discountEndsAt: z.string().optional(),
})

export type CreateProductValues = z.infer<typeof createProductSchema>

export function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100)
}
