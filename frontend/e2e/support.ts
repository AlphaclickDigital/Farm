import { test as base, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "dotenv"
import Stripe from "stripe"

export const SAMPLE_PASSWORD = "12345678"
export const APP_API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001"
export const TEST_API = process.env.E2E_API_URL ?? "http://localhost:3101"

export const SAMPLE_VENDORS = [
  { email: "greenvalley@example.com", store: "Green Valley Farm" },
  { email: "southerncross@example.com", store: "Southern Cross Beef Farm" },
  { email: "goldenharvest@example.com", store: "Golden Harvest Poultry" },
  { email: "riverlandfresh@example.com", store: "Riverland Fresh Produce" },
  { email: "highlanddairy@example.com", store: "Highland Dairy Farm" },
  { email: "outbackfree@example.com", store: "Outback Free Range Farm" },
  { email: "sunnyacres@example.com", store: "Sunny Acres Farm" },
  { email: "bluemountain@example.com", store: "Blue Mountain Honey Farm" },
  { email: "coastalseafood@example.com", store: "Coastal Seafood Farm" },
  { email: "freshroots@example.com", store: "Fresh Roots Organic Farm" },
]
export const CUSTOMER = "sample.customer1@example.com"
export const ADMIN = "sample.admin@example.com"

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Page fixture whose browser-side API calls go to the test API instance. */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, provide) => {
    if (TEST_API !== APP_API) {
      await page.route(new RegExp(`^${escape(APP_API)}/`), (route) =>
        route.continue({ url: route.request().url().replace(APP_API, TEST_API) })
      )
    }
    await provide(page)
  },
})
export { expect }

export async function login(page: Page, email: string, password = SAMPLE_PASSWORD) {
  await page.goto("/login")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByPlaceholder("********").fill(password)
  await page.locator("form").getByRole("button", { name: "Sign In" }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
}

export async function logout(page: Page) {
  // Leave the app first. NextAuth re-sets the session cookie on every
  // /api/auth/session read, so a read still in flight from the last page (the
  // session provider fetches on mount) could restore the cookie we clear.
  await page.goto("about:blank")
  await page.context().clearCookies()
}

/** The backend access token of the signed-in browser session. */
export async function sessionToken(page: Page): Promise<string> {
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json())
  return session.user.accessToken
}

export async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${TEST_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

export async function clearCart(page: Page) {
  await page.evaluate(() => localStorage.removeItem("cart-storage"))
}

/** Fills Stripe's Payment Element with a test card. */
export async function fillTestCard(page: Page, number: string) {
  const frame = page.frameLocator('iframe[title*="Secure payment input frame"]').first()
  // The Payment Element loads asynchronously from Stripe; give it time.
  await frame.locator('[name="number"]').waitFor({ timeout: 60_000 })
  await frame.locator('[name="number"]').fill(number)
  await frame.locator('[name="expiry"]').fill("12 / 34")
  await frame.locator('[name="cvc"]').fill("123")
  const postal = frame.locator('[name="postalCode"]')
  if (await postal.isVisible().catch(() => false)) await postal.fill("3350")
}

export async function productByName(name: string) {
  const res = await fetch(`${TEST_API}/products?search=${encodeURIComponent(name)}`)
  const products = (await res.json()) as { id: string; name: string; stockAmount: number; vendorId: string }[]
  const product = products.find((p) => p.name === name)
  if (!product) throw new Error(`Product "${name}" not found in public catalog`)
  return product
}

export async function addToCart(page: Page, name: string, variant: string | null, quantity = 1) {
  const product = await productByName(name)
  await page.goto(`/products/${product.id}`)
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  if (variant) await page.getByRole("button", { name: new RegExp(`^${escape(variant)} —`) }).click()
  for (let i = 1; i < quantity; i++) await page.getByRole("button", { name: "Increase quantity", exact: true }).click()
  await page.getByRole("button", { name: /Add to Cart/ }).click()
  await expect(page.getByText(`${name} added to cart!`)).toBeVisible()
  return product
}

export async function fillAddress(page: Page) {
  await page.locator("#name").fill("Sam Sample")
  await page.locator("#address").fill("1 Example Street")
  await page.locator("#city").fill("Ballarat")
  await page.locator("#state").selectOption("VIC")
  await page.locator("#zip").fill("3350")
  await page.locator("#phone").fill("0491 570 156")
}

/** Runs the 3-step checkout for the current cart; returns the new order id. */
export async function checkout(page: Page, card = "4242 4242 4242 4242") {
  await page.goto("/checkout")
  await fillAddress(page)
  await page.getByRole("button", { name: "Continue to Shipping" }).click()
  await page.getByRole("button", { name: "Continue to Payment" }).click()
  await fillTestCard(page, card)
  await page.getByRole("button", { name: "Pay Now" }).click()
  // Dev-mode compiles of the order page can be slow on first visit.
  await page.waitForURL(/\/orders\/[0-9a-f-]+\?success=true/, { timeout: 150_000 })
  return new URL(page.url()).pathname.split("/").pop()!
}

let stripeClient: Stripe | undefined
function testStripe() {
  if (!stripeClient) {
    const backendEnv = parse(readFileSync(path.resolve(__dirname, "../../backend/.env")))
    const key = process.env.STRIPE_SECRET_KEY ?? backendEnv.STRIPE_SECRET_KEY ?? ""
    if (!key.startsWith("sk_test_")) throw new Error("E2E tests only use a Stripe TEST secret key")
    stripeClient = new Stripe(key)
  }
  return stripeClient
}

/**
 * Places a paid order through the API with a server-side Stripe test card.
 * For tests about what happens *after* checkout: Stripe's Payment Element
 * starts adding Link/anti-automation steps after several rapid browser
 * payments, so browser checkout is reserved for the checkout tests themselves.
 */
export async function placeOrderViaApi(
  customerToken: string,
  lines: { name: string; variant: string; quantity: number }[]
) {
  const items = []
  const vendorIds = new Set<string>()
  for (const line of lines) {
    const { id } = await productByName(line.name)
    const product = await (await fetch(`${TEST_API}/products/${id}`)).json()
    const variant = product.variants.find((v: { label: string }) => v.label === line.variant)
    const discountActive =
      product.discountName && product.discountCents && (!product.discountEndsAt || new Date(product.discountEndsAt) > new Date())
    const priceCents = Math.max(0, variant.priceCents - (discountActive ? product.discountCents : 0))
    items.push({ productId: id, variantId: variant.id, quantity: line.quantity, priceCents })
    vendorIds.add(product.vendorId)
  }
  const shippingSelections = []
  for (const vendorId of vendorIds) {
    const options = await (await fetch(`${TEST_API}/vendors/${vendorId}/shipping`)).json()
    shippingSelections.push({ vendorId, shippingOptionId: options[0].id })
  }
  const shippingAddress = { name: "Sam Sample", address: "1 Example Street", city: "Ballarat", state: "VIC", zip: "3350", phone: "0491 570 156" }

  const intent = await api(customerToken, "POST", "/payment/create-intent", { items, shippingSelections, shippingAddress })
  expect(intent.status).toBe(201)
  await testStripe().paymentIntents.confirm(intent.body.paymentIntentId, {
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3000/checkout",
  })
  const order = await api(customerToken, "POST", "/payment/create-order", {
    paymentIntentId: intent.body.paymentIntentId,
    items,
    shippingSelections,
    shippingAddress,
  })
  expect(order.status).toBe(201)
  return order.body as { id: string; vendorOrders: { id: string }[] }
}

/**
 * Stands in for Cloudinary's unsigned upload endpoint so tests exercise the
 * app's upload handling without writing to the real Cloudinary account.
 */
export async function mockCloudinary(page: Page, secureUrl: string) {
  await page.route(/^https:\/\/api\.cloudinary\.com\/v1_1\/.*\/image\/upload/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secure_url: secureUrl }) })
  )
}

// A 1x1 PNG, used as the "file" a vendor uploads.
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
)
