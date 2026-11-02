
import { z } from "zod"

export const vendorRegistrationSchema = z.object({
  storeName: z.string().min(3, "Store name must be at least 3 characters"),
  description: z.string().optional(),
})

export type VendorRegistrationValues = z.infer<typeof vendorRegistrationSchema>
