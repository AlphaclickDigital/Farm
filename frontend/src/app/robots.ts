import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/storefront"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/vendor/dashboard", "/checkout", "/cart", "/account", "/orders", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
