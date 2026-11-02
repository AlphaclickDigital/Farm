import {
  test,
  expect,
  login,
  clearCart,
  fillTestCard,
  fillAddress,
  sessionToken,
  api,
  productByName,
  addToCart,
  CUSTOMER,
} from "./support"

/** Prices like "$9.00" → 900. */
const cents = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100)

test.describe("Customer journey", () => {
  test("homepage shows announcement, categories, shelves and farms", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1, name: "Good food starts at the farm." })).toBeVisible()
    await expect(page.getByText("Buy direct from independent Australian farms")).toBeVisible()
    await expect(page.locator('a[href="/products?category=seafood"]').first()).toBeVisible()
    await expect(page.locator('a[href="/products?category=honey"]').first()).toBeVisible()

    // Product shelves are tabbed; switching tabs shows a different panel.
    const shelves = page.getByRole("tablist", { name: "Product shelves" })
    await expect(page.getByRole("tabpanel").getByRole("heading", { level: 3 }).first()).toBeVisible()
    await shelves.getByRole("tab", { name: "On sale" }).click()
    await expect(page.getByRole("tabpanel").getByText("Bulk Buy Week").first()).toBeVisible()

    const farms = page.getByRole("region", { name: "Meet the farms behind your food" })
    await expect(farms.getByText("Fresh Roots Organic Farm")).toBeVisible()
    await expect(page.getByText("Wattle Creek Pastures")).toHaveCount(0)
    await page.locator('a[href="/vendors?state=TAS"]').first().click()
    await expect(page).toHaveURL(/\/vendors\?state=TAS/)
    await expect(page.getByRole("heading", { level: 1, name: "Farms in Tasmania" })).toBeVisible()
    await expect(page.getByText("Highland Dairy Farm")).toBeVisible()
  })

  test("farm directory, search and store page", async ({ page }) => {
    await page.goto("/vendors")
    await expect(page.getByText("Green Valley Farm")).toBeVisible()
    await expect(page.getByText("Wattle Creek Pastures")).toHaveCount(0)
    await expect(page.getByText("Yarra Valley, VIC")).toBeVisible()

    await page.getByPlaceholder("Search farms by name, region or what they grow").fill("honey")
    await expect(page).toHaveURL(/q=honey/)
    await expect(page.getByText("Blue Mountain Honey Farm")).toBeVisible()
    await expect(page.getByText("Green Valley Farm")).toHaveCount(0)

    await page.getByText("Blue Mountain Honey Farm").click()
    await expect(page.getByRole("heading", { level: 1, name: "Blue Mountain Honey Farm" })).toBeVisible()
    await expect(page.getByText("Blackheath, Blue Mountains, NSW")).toBeVisible()
    await expect(page.getByText("(02) 5550 0108")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Yellow Box Honey" })).toBeVisible()

    // Category tabs and search are scoped to this farm.
    await page.getByRole("list", { name: "Product categories" }).getByRole("link", { name: /Farm Produce/ }).click()
    await expect(page).toHaveURL(/category=farm-produce/)
    await expect(page.getByRole("heading", { name: "Yellow Box Honey" })).toHaveCount(0)
    await page.getByRole("list", { name: "Product categories" }).getByRole("link", { name: /All products/ }).click()
    await page.getByPlaceholder("Search Blue Mountain Honey Farm").fill("creamed")
    await expect(page).toHaveURL(/q=creamed/)
    await expect(page.getByRole("heading", { name: "Creamed Honey" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Yellow Box Honey" })).toHaveCount(0)

    // Reviews section with a rating breakdown.
    await expect(page.getByRole("heading", { name: "Customer reviews" })).toBeVisible()
    await expect(page.getByText("Verified purchase").first()).toBeVisible()
  })

  test("header search: suggestions, keyboard and results page", async ({ page }) => {
    await page.goto("/products")
    const search = page.getByRole("combobox", { name: "Search the marketplace" })
    await search.fill("honey")
    const suggestions = page.getByRole("listbox", { name: "Search suggestions" })
    await expect(suggestions.getByRole("option", { name: /Blue Mountain Honey Farm/ }).first()).toBeVisible()
    await expect(suggestions.getByRole("option", { name: /Creamed Honey/ })).toBeVisible()

    // Picking a farm suggestion opens that farm.
    await suggestions.getByRole("option", { name: /Blackheath/ }).click()
    await expect(page).toHaveURL(/\/vendors\//)
    await expect(page.getByRole("heading", { level: 1, name: "Blue Mountain Honey Farm" })).toBeVisible()

    // Enter with nothing highlighted searches the catalog.
    await search.fill("prawn")
    await search.press("Enter")
    await expect(page).toHaveURL(/\/products\?q=prawn/)
    await expect(page.getByRole("heading", { level: 1, name: "Results for “prawn”" })).toBeVisible()
    await expect(page.getByText("Cooked Tiger Prawns")).toBeVisible()
    await expect(page.getByText("Navel Oranges")).toHaveCount(0)

    await search.fill("Imperfect")
    await search.press("Enter")
    await expect(page.getByText("Nothing matches just yet")).toBeVisible() // inactive product is hidden

    // Recent searches are offered when the field is empty.
    await search.fill("")
    await search.focus()
    await expect(suggestions.getByRole("option", { name: "prawn" })).toBeVisible()
  })

  test("catalog filters, sorting, pagination and category breadcrumb", async ({ page }) => {
    await page.goto("/products")
    await expect(page.getByRole("heading", { level: 1, name: "Shop all" })).toBeVisible()
    await expect(page.getByText(/^\d+ products$/)).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible()

    const filters = page.getByRole("complementary", { name: "Filters" })
    await filters.getByRole("checkbox", { name: /^Seafood/ }).click()
    await expect(page).toHaveURL(/category=seafood/)
    await expect(page.getByText("Barramundi Fillets (Skin-On)")).toBeVisible()
    await expect(page.getByText("Pink Lady Apples")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Remove filter Seafood" })).toBeVisible()

    // Price low → high: card prices never go down.
    await page.getByRole("combobox", { name: "Sort products" }).click()
    await page.getByRole("option", { name: "Price: low to high" }).click()
    await expect(page).toHaveURL(/sort=price-asc/)
    const prices = await page.locator("article p span.tabular-nums.font-bold").allTextContents()
    expect(prices.length).toBeGreaterThan(2)
    const values = prices.map(cents)
    expect([...values].sort((a, b) => a - b)).toEqual(values)

    // Removing the chip clears the filter but keeps the sort.
    await page.getByRole("button", { name: "Remove filter Seafood" }).click()
    await expect(page).not.toHaveURL(/category=/)
    await expect(page).toHaveURL(/sort=price-asc/)

    // State + offer filters.
    await filters.getByRole("checkbox", { name: /Victoria/ }).click()
    await expect(page).toHaveURL(/state=VIC/)
    await filters.getByRole("checkbox", { name: /On sale/ }).click()
    await expect(page).toHaveURL(/sale=1/)
    await expect(page.getByText("Organic Heirloom Tomatoes")).toBeVisible()
    await expect(page.getByText("Premium Beef Mince")).toHaveCount(0) // NSW farm

    // Department navigation and the product page breadcrumb.
    await page.getByRole("navigation", { name: "Departments" }).first().getByRole("link", { name: "Seafood" }).click()
    await expect(page).toHaveURL(/\/products\?category=seafood$/)
    await expect(page.getByRole("heading", { level: 1, name: "Seafood" })).toBeVisible()

    const apples = await productByName("Pink Lady Apples")
    await page.goto(`/products/${apples.id}`)
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Fruits", exact: true }).click()
    await expect(page).toHaveURL(/category=fruits/)
    await expect(page.getByText("Pink Lady Apples")).toBeVisible()
    await expect(page.getByText("Cooked Tiger Prawns")).toHaveCount(0)
  })

  test("product page: discount pricing, variant selection, quantity and stock limits", async ({ page }) => {
    const mince = await productByName("Premium Beef Mince")
    await page.goto(`/products/${mince.id}`)
    await expect(page.getByText("Bulk Buy Week").first()).toBeVisible()
    await expect(page.getByText("$9.00").first()).toBeVisible() // $10.50 - $1.50
    await page.getByRole("button", { name: /^1kg pack —/ }).click()
    await expect(page.getByRole("button", { name: /Add to Cart · \$18\.40/ })).toBeVisible()
    await page.getByRole("button", { name: "Increase quantity", exact: true }).click()
    await expect(page.getByRole("button", { name: /Add to Cart · \$36\.80/ })).toBeVisible()

    // Farm identity, delivery options and structured data.
    await expect(page.getByRole("heading", { name: "Delivery & pickup" })).toBeVisible()
    await expect(page.getByText("Chilled Express").first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Visit the farm shop" }).first()).toBeVisible()
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
    const product = jsonLd.map((t) => JSON.parse(t)).find((d) => d["@type"] === "Product")
    expect(product.name).toBe("Premium Beef Mince")
    expect(product.offers.priceCurrency).toBe("AUD")
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/products/${mince.id}$`))

    const tbone = await productByName("Dry-Aged T-Bone")
    await page.goto(`/products/${tbone.id}`)
    await expect(page.getByText("Out of Stock")).toBeVisible()
    await expect(page.getByRole("button", { name: /Add to Cart/ })).toBeDisabled()

    await page.goto("/products/00000000-0000-0000-0000-000000000000")
    await expect(page.getByRole("heading", { name: "This one isn't on the shelf" })).toBeVisible()
  })

  test("quick add from a product card", async ({ page }) => {
    await page.goto("/")
    await clearCart(page)
    await page.goto("/products?q=Stringybark")
    await page.getByRole("button", { name: "Choose a size of Stringybark Honey" }).click()
    await page.getByRole("button", { name: /^1kg jar/ }).click()
    await expect(page.getByText("Stringybark Honey added to cart!")).toBeVisible()
    await page.getByRole("button", { name: /^Cart, 1 item/ }).click()
    const sheet = page.getByRole("dialog")
    await expect(sheet.getByText("Blue Mountain Honey Farm")).toBeVisible()
    await expect(sheet.getByText("1kg jar")).toBeVisible()
  })

  test("cart: grouped by farm, quantity updates, totals and removal", async ({ page }) => {
    await login(page, CUSTOMER)
    await clearCart(page)
    await addToCart(page, "Premium Beef Mince", "500g pack", 2)
    await addToCart(page, "Raw Eucalyptus Honey", "250g jar", 1)

    await page.goto("/cart")
    await expect(page.getByText("2 farms").first()).toBeVisible()
    await expect(page.getByRole("region", { name: "Southern Cross Beef Farm" })).toBeVisible()
    const honeyFarm = page.getByRole("region", { name: "Blue Mountain Honey Farm" })
    await expect(honeyFarm.getByText("Raw Eucalyptus Honey")).toBeVisible()

    const summary = page.locator('[aria-label="Order summary"]')
    await expect(summary.getByText("Subtotal (3 items)")).toBeVisible()
    await expect(summary.getByText("$27.50").first()).toBeVisible() // 2 x $9.00 + $9.50

    await page.getByRole("button", { name: "Increase quantity of Raw Eucalyptus Honey" }).click()
    await expect(summary.getByText("$37.00").first()).toBeVisible()
    await page.getByRole("button", { name: "Remove Raw Eucalyptus Honey" }).click()
    await expect(summary.getByText("$18.00").first()).toBeVisible()
    await expect(page.getByText("Raw Eucalyptus Honey")).toHaveCount(0)
    await expect(page.getByRole("region", { name: "Blue Mountain Honey Farm" })).toHaveCount(0)
  })

  test("guests can open the cart and return to checkout after signing in", async ({ page }) => {
    await page.goto("/")
    await clearCart(page)
    await addToCart(page, "Raw Eucalyptus Honey", "250g jar", 1)
    await page.goto("/cart")
    await expect(page).toHaveURL(/\/cart$/)
    await page.getByRole("link", { name: "Sign in to check out" }).click()
    await expect(page).toHaveURL(/\/login\?callbackUrl=(%2F|\/)checkout/)
    await expect(page.getByText("Sign in to finish checking out. Your cart is saved.")).toBeVisible()
    await page.getByPlaceholder("you@example.com").fill(CUSTOMER)
    await page.getByPlaceholder("********").fill("12345678")
    await page.locator("form").getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL(/\/checkout$/)
    await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible()
  })

  test("registration, login and wrong-password rejection", async ({ page }) => {
    const email = `e2e.customer.${Date.now()}@example.com`
    await page.goto("/register")
    await page.getByLabel("Full name").fill("E2E Customer")
    await page.getByPlaceholder("you@example.com").fill(email)
    await page.getByPlaceholder("********").nth(0).fill("12345678")
    await page.getByPlaceholder("********").nth(1).fill("12345678")
    await page.getByRole("button", { name: /Create|Sign Up|Register/i }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.getByPlaceholder("you@example.com").fill(email)
    await page.getByPlaceholder("********").fill("wrong-password")
    await page.locator("form").getByRole("button", { name: "Sign In" }).click()
    await expect(page.locator("form").getByRole("alert")).toHaveText("Invalid email or password")

    await login(page, email)
    await expect(page).toHaveURL("http://localhost:3000/")
    await page.goto("/orders")
    await expect(page.getByText("No orders yet")).toBeVisible()
    await page.goto("/account")
    await expect(page.getByRole("heading", { level: 1, name: "Hi, E2E" })).toBeVisible()
  })

  test("sign-in pages: focused layout, seller and checkout context, password reveal, safe redirects", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2Fvendor%2Fonboarding")
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible()
    await expect(page.getByText("Sign in to start your application to sell on FarmMarket.")).toBeVisible()
    // Focused layout: brand link and a way back, but no storefront search or footer columns.
    await expect(page.getByRole("link", { name: "FarmMarket home" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Back/ })).toHaveAttribute("href", "/products")
    await expect(page.getByRole("combobox", { name: "Search the marketplace" })).toHaveCount(0)

    await page.getByRole("link", { name: "Create an account" }).click()
    await expect(page).toHaveURL(/\/register\?callbackUrl=%2Fvendor%2Fonboarding$/)
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible()
    await expect(page.getByText(/Step one of selling on FarmMarket/)).toBeVisible()

    const password = page.getByLabel("Password", { exact: true })
    await password.fill("abc")
    await expect(password).toHaveAttribute("type", "password")
    const reveal = page.getByRole("button", { name: "Show password" }).first()
    await reveal.click()
    await expect(password).toHaveAttribute("type", "text")
    await expect(reveal).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible()
    await expect(page.getByText("Please confirm your password")).toBeVisible()
    await password.fill("12345678")
    await expect(page.getByText("At least 8 characters")).toBeVisible()
    await page.getByLabel("Confirm password").fill("12345679")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page.getByText("Passwords do not match")).toBeVisible()

    // An off-site callback is ignored, so sign-in falls back to the role's home page.
    await page.goto("/login?callbackUrl=%2F%2Fevil.example%2F")
    await page.getByPlaceholder("you@example.com").fill(CUSTOMER)
    await page.getByPlaceholder("********").fill("12345678")
    await page.locator("form").getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL("http://localhost:3000/")
  })

  test("password recovery: request a link, change email, and invalid reset links", async ({ page }) => {
    await page.goto("/login")
    await page.getByRole("link", { name: "Forgot password?" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Forgot your password?" })).toBeVisible()
    await page.getByRole("button", { name: "Send reset link" }).click()
    await expect(page.getByText("Please enter a valid email address")).toBeVisible()

    const email = `nobody.${Date.now()}@example.com`
    await page.getByLabel("Email").fill(email)
    await page.getByRole("button", { name: "Send reset link" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
    await page.getByRole("button", { name: "Use a different email" }).click()
    await expect(page.getByLabel("Email")).toHaveValue("")

    await page.goto("/reset-password")
    await expect(page.getByRole("heading", { level: 1, name: "This link doesn't work" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password")

    await page.goto("/reset-password?token=not-a-real-token")
    await page.getByLabel("New password", { exact: true }).fill("a-new-password")
    await page.getByLabel("Confirm new password").fill("a-new-password")
    await page.getByRole("button", { name: "Reset password" }).click()
    const alert = page.locator("form").getByRole("alert")
    await expect(alert).toContainText("Invalid or expired reset link")
    await expect(alert.getByRole("link", { name: "Request a new link" })).toBeVisible()
  })

  test("checkout: address validation, multi-farm Stripe test payment, order history and stock", async ({ page }) => {
    await login(page, CUSTOMER)
    await clearCart(page)
    const mince = await addToCart(page, "Premium Beef Mince", "500g pack", 1)
    const honey = await addToCart(page, "Raw Eucalyptus Honey", "250g jar", 1)

    await page.goto("/checkout")
    const toShipping = page.getByRole("button", { name: "Continue to Shipping" })
    await expect(toShipping).toBeDisabled()
    await page.locator("#name").fill("Sam Sample")
    await page.locator("#address").fill("1 Example Street")
    await page.locator("#city").fill("Ballarat")
    await page.locator("#state").selectOption("VIC")
    await page.locator("#zip").fill("33")
    await page.locator("#zip").blur()
    await expect(page.getByText("Australian postcodes have 4 digits")).toBeVisible()
    await page.locator("#zip").fill("3350")
    await expect(toShipping).toBeDisabled() // phone still missing
    await page.locator("#phone").fill("0491 570 156")
    await toShipping.click()

    await expect(page.getByText("Southern Cross Beef Farm").first()).toBeVisible()
    await expect(page.getByText("Blue Mountain Honey Farm").first()).toBeVisible()
    await expect(page.getByText("Chilled Express").first()).toBeVisible()
    await page.getByRole("button", { name: "Continue to Payment" }).click()

    await fillTestCard(page, "4242 4242 4242 4242")
    await page.getByRole("button", { name: "Pay Now" }).click()
    await page.waitForURL(/\/orders\/[0-9a-f-]+\?success=true/, { timeout: 150_000 })

    // $9.00 mince + $9.50 honey + $14.95 chilled (550g) + $8.95 standard = $42.40
    await expect(page.getByText("$42.40").first()).toBeVisible()
    await expect(page.locator("#main-content").getByText("Order placed successfully!")).toBeVisible()
    const orderId = new URL(page.url()).pathname.split("/").pop()!

    await page.goto("/orders")
    await expect(page.locator(`a[href="/orders/${orderId}"]`)).toBeVisible()
    await page.goto("/account")
    await expect(page.locator(`a[href="/orders/${orderId}"]`)).toBeVisible()

    expect((await productByName("Premium Beef Mince")).stockAmount).toBe(mince.stockAmount - 500)
    expect((await productByName("Raw Eucalyptus Honey")).stockAmount).toBe(honey.stockAmount - 250)

    const order = await api(await sessionToken(page), "GET", `/orders/my-orders/${orderId}`)
    expect(order.body.totalAmountCents).toBe(4240)
    expect(order.body.vendorOrders).toHaveLength(2)

    // "Buy again" re-adds the order's items at today's prices.
    await clearCart(page)
    await page.goto(`/orders/${orderId}`)
    await page.getByRole("button", { name: "Buy again" }).click()
    await expect(page).toHaveURL(/\/cart$/)
    await expect(page.getByText("Premium Beef Mince")).toBeVisible()
    await expect(page.getByText("Raw Eucalyptus Honey")).toBeVisible()
    await clearCart(page)
  })

  test("declined card shows the Stripe error and creates no order", async ({ page }) => {
    await login(page, CUSTOMER)
    await clearCart(page)
    const before = await productByName("Raw Eucalyptus Honey")
    await addToCart(page, "Raw Eucalyptus Honey", "250g jar", 1)
    await page.goto("/checkout")
    await fillAddress(page)
    await page.getByRole("button", { name: "Continue to Shipping" }).click()
    await page.getByRole("button", { name: "Continue to Payment" }).click()
    await fillTestCard(page, "4000 0000 0000 0002")
    await page.getByRole("button", { name: "Pay Now" }).click()
    // Stripe test mode slows down after several back-to-back browser payments.
    await expect(page.getByText("Your card has been declined.").first()).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/\/checkout/)
    expect((await productByName("Raw Eucalyptus Honey")).stockAmount).toBe(before.stockAmount)
  })

  test("mobile layout: menu, search and no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ["/", "/products", "/vendors", "/cart"]) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
    }
    await page.goto("/")
    await expect(page.getByRole("combobox", { name: "Search the marketplace" })).toBeVisible()
    await page.getByRole("button", { name: "Open menu" }).click()
    await page.getByRole("dialog").getByRole("link", { name: "Seafood" }).click()
    await expect(page).toHaveURL(/category=seafood/)
    await page.getByRole("button", { name: /^Filters/ }).click()
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Filters" })).toBeVisible()
  })

  test("crawler files and static images are public", async ({ page }) => {
    for (const path of ["/robots.txt", "/sitemap.xml", "/images/hero-harvest.jpg", "/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
      const res = await page.request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(200)
    }
    const sitemap = await (await page.request.get("/sitemap.xml")).text()
    expect(sitemap).toContain("/products/")
    expect(sitemap).toContain("/vendors/")
  })
})
