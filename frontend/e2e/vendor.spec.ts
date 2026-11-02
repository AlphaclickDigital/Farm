import {
  test,
  expect,
  login,
  logout,
  sessionToken,
  api,
  mockCloudinary,
  placeOrderViaApi,
  fillTestCard,
  productByName,
  TINY_PNG,
  SAMPLE_VENDORS,
  CUSTOMER,
  TEST_API,
} from "./support"

test.describe("Vendor journey", () => {
  test("every sample vendor signs in with the shared password and reaches its own dashboard", async ({ page }) => {
    for (const vendor of SAMPLE_VENDORS) {
      await logout(page)
      await login(page, vendor.email)
      await expect(page).toHaveURL(/\/vendor\/dashboard/)
      await expect(page.getByText(vendor.store).first()).toBeVisible()
      const me = await api(await sessionToken(page), "GET", "/vendors/me")
      expect(me.body.storeName).toBe(vendor.store)
    }
  })

  test("vendor updates its store profile and the public store page reflects it", async ({ page }) => {
    await login(page, "greenvalley@example.com")
    const token = await sessionToken(page)
    try {
      await page.goto("/vendor/dashboard/settings")
      await expect(page.locator("#location")).toHaveValue("Yarra Valley")
      await expect(page.locator("#state")).toHaveValue("VIC")
      await expect(page.locator("#phone")).toHaveValue("(03) 5550 0101")

      await page.locator("#phone").fill("not a phone")
      await page.getByRole("button", { name: "Save Changes" }).click()
      await expect(page.getByText("Enter a valid phone number")).toBeVisible()

      await page.locator("#phone").fill("(03) 5550 0177")
      await page.getByRole("button", { name: "Save Changes" }).click()
      await expect(page.getByText("Settings saved successfully")).toBeVisible()

      const me = await api(token, "GET", "/vendors/me")
      expect(me.body.phone).toBe("(03) 5550 0177")
      await page.goto(`/vendors/${me.body.id}`)
      await expect(page.getByText("(03) 5550 0177")).toBeVisible()
      await expect(page.getByText("Yarra Valley, VIC")).toBeVisible()
    } finally {
      await api(token, "PATCH", "/vendors/me", { phone: "(03) 5550 0101" })
    }
  })

  test("vendor creates a product with an image and two variants, edits price and stock, then unpublishes it", async ({ page }) => {
    const imageUrl = "https://images.pexels.com/photos/4113898/pexels-photo-4113898.jpeg?auto=compress&cs=tinysrgb&w=800"
    await mockCloudinary(page, imageUrl)
    await login(page, "freshroots@example.com")
    const token = await sessionToken(page)
    const name = `E2E UI Herb Bundle ${Date.now()}`
    let productId: string | undefined

    try {
      await page.goto("/vendor/dashboard/products/new")
      await page.locator("#name").fill(name)
      await page.locator("#description").fill("Created by the Playwright vendor test.")
      await page.getByRole("combobox").filter({ hasText: "Select a category" }).click()
      await page.getByRole("option", { name: "Herbs", exact: true }).click()
      await page.getByRole("combobox").filter({ hasText: "Select base unit" }).click()
      await page.getByRole("option", { name: "Piece" }).click()
      await page.locator("#stockAmount").fill("50")
      await page.locator('input[name="variants.0.label"]').fill("Bunch")
      await page.locator('input[name="variants.0.unitAmount"]').fill("1")
      await page.locator('input[name="variants.0.price"]').fill("4.20")
      await page.getByRole("button", { name: "Add Variant" }).click()
      await page.locator('input[name="variants.1.label"]').fill("Two bunches")
      await page.locator('input[name="variants.1.unitAmount"]').fill("2")
      await page.locator('input[name="variants.1.price"]').fill("8.00")
      await page.locator('input[type="file"]').setInputFiles({ name: "herbs.png", mimeType: "image/png", buffer: TINY_PNG })
      await expect(page.locator(`img[src="${imageUrl}"]`)).toBeVisible()
      await page.getByRole("button", { name: "Publish", exact: true }).click()
      await expect(page.getByText("Product published!")).toBeVisible()
      await page.waitForURL(/\/vendor\/dashboard\/products$/)

      const created = (await api(token, "GET", "/products/vendor/my-products")).body.find((p: { name: string }) => p.name === name)
      productId = created.id
      expect(created.isActive).toBe(true)
      expect(created.stockAmount).toBe(50)
      expect(created.images.map((i: { url: string }) => i.url)).toEqual([imageUrl])
      expect(
        created.variants.map((v: { label: string; unitAmount: number; priceCents: number }) => [v.label, v.unitAmount, v.priceCents]).sort()
      ).toEqual([["Bunch", 1, 420], ["Two bunches", 2, 800]])

      await page.goto(`/products/${productId}`)
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
      await expect(page.getByText("50 available")).toBeVisible() // default variant 'Bunch' uses 1 of 50

      await page.goto(`/vendor/dashboard/products/${productId}/edit`)
      await expect(page.locator("#stockAmount")).toHaveValue("50")
      await page.locator("#stockAmount").fill("75")
      await page.locator('input[name="variants.0.price"]').fill("4.50")
      await page.getByRole("button", { name: "Save & Publish" }).click()
      await expect(page.getByText("Product updated & published!")).toBeVisible()

      const edited = (await api(token, "GET", "/products/vendor/my-products")).body.find((p: { id: string }) => p.id === productId)
      expect(edited.stockAmount).toBe(75)
      expect(edited.variants.find((v: { label: string }) => v.label === "Bunch").priceCents).toBe(450)
      expect(edited.variants.map((v: { id: string }) => v.id).sort()).toEqual(created.variants.map((v: { id: string }) => v.id).sort())

      await page.goto(`/vendor/dashboard/products/${productId}`)
      await page.getByRole("button", { name: "Unpublish" }).click()
      // exact: "Publish" is a substring of "Unpublish"
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible()
      const listed = await (await fetch(`${TEST_API}/products?search=${encodeURIComponent(name)}`)).json()
      expect(listed).toHaveLength(0)
    } finally {
      if (productId) await api(token, "DELETE", `/products/${productId}`) // unsold, so deletable
    }
  })

  test("vendor fulfils an order: sees it, adds tracking, completes it, and the order then locks", async ({ page }) => {
    await login(page, CUSTOMER)
    const order = await placeOrderViaApi(await sessionToken(page), [{ name: "Creamed Honey", variant: "250g jar", quantity: 1 }])
    const orderId = order.id
    const vendorOrderId = order.vendorOrders[0].id

    await logout(page)
    await login(page, "bluemountain@example.com")
    await page.goto("/vendor/dashboard/orders")
    await expect(page.locator(`a[href="/vendor/dashboard/orders/${vendorOrderId}"]`).first()).toBeVisible()

    await page.goto(`/vendor/dashboard/orders/${vendorOrderId}`)
    const status = page.getByRole("combobox", { name: "Order status" })
    await expect(status).toHaveText("PROCESSING")
    await status.click()
    await expect(page.getByRole("option")).toHaveText(["PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"])
    await page.keyboard.press("Escape")

    await page.locator("#trackingNumber").fill("AP123456789AU")
    await page.getByRole("button", { name: "Add Tracking & Mark Shipped" }).click()
    await expect(page.getByText("Tracking info added & order marked as shipped!")).toBeVisible()
    await expect(status).toHaveText("SHIPPED")

    await status.click()
    await expect(page.getByRole("option")).toHaveText(["SHIPPED", "COMPLETED"])
    await page.getByRole("option", { name: "COMPLETED" }).click()
    await expect(page.getByText("Order status updated!")).toBeVisible()
    await expect(status).toHaveText("COMPLETED")
    await expect(status).toBeDisabled()
    await expect(page.getByText("can no longer change status")).toBeVisible()

    await logout(page)
    await login(page, CUSTOMER)
    await page.goto(`/orders/${orderId}`)
    await expect(page.getByText("AP123456789AU")).toBeVisible()
    await expect(page.getByText("COMPLETED").first()).toBeVisible()
  })

  test("vendor cancels an order: the customer is refunded and stock is restored", async ({ page }) => {
    const before = await productByName("Stringybark Honey")
    await login(page, CUSTOMER)
    const order = await placeOrderViaApi(await sessionToken(page), [{ name: "Stringybark Honey", variant: "500g jar", quantity: 1 }])
    expect((await productByName("Stringybark Honey")).stockAmount).toBe(before.stockAmount - 500)
    const vendorOrderId = order.vendorOrders[0].id

    await logout(page)
    await login(page, "bluemountain@example.com")
    await page.goto(`/vendor/dashboard/orders/${vendorOrderId}`)
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("combobox", { name: "Order status" }).click()
    await page.getByRole("option", { name: "CANCELLED" }).click()
    await expect(page.getByText("Order cancelled and refunded")).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Order status" })).toHaveText("CANCELLED")

    expect((await productByName("Stringybark Honey")).stockAmount).toBe(before.stockAmount)
    const vendorOrder = await api(await sessionToken(page), "GET", `/orders/vendor/orders/${vendorOrderId}`)
    expect(vendorOrder.body.status).toBe("CANCELLED")
    expect(vendorOrder.body.stripeRefundId).toMatch(/^re_/)
  })

  test("vendors cannot open other vendors' orders, and dashboards are role-gated", async ({ page }) => {
    await login(page, "bluemountain@example.com")
    const theirs = await api(await sessionToken(page), "GET", "/orders/vendor/orders")
    expect(theirs.body.length).toBeGreaterThan(0)
    const otherVendorOrderId = theirs.body[0].id

    await logout(page)
    await login(page, "greenvalley@example.com")
    await page.goto(`/vendor/dashboard/orders/${otherVendorOrderId}`)
    await expect(page.getByText("Order not found")).toBeVisible()
    await page.goto("/admin")
    await expect(page).toHaveURL("http://localhost:3000/")

    await logout(page)
    await login(page, CUSTOMER)
    await page.goto("/vendor/dashboard")
    await expect(page).toHaveURL("http://localhost:3000/")
    await page.goto("/admin")
    await expect(page).toHaveURL("http://localhost:3000/")

    await logout(page)
    await page.goto("/vendor/dashboard")
    await expect(page).toHaveURL(/\/login/)
  })

  test("vendor buys a featured listing with a Stripe test card and it is featured on the homepage", async ({ page }) => {
    await login(page, "sunnyacres@example.com")
    await page.goto("/vendor/dashboard/promotions")
    await page.locator("select").filter({ has: page.locator("option", { hasText: "Select a product..." }) }).selectOption({ label: "Blueberries" })
    await page.getByRole("button", { name: "Feature This Product" }).click()
    await expect(page.getByText("Complete Payment")).toBeVisible()
    await fillTestCard(page, "4242 4242 4242 4242")
    await page.getByRole("button", { name: "Pay & Activate" }).click()
    await expect(page.getByText("Promotion activated!")).toBeVisible({ timeout: 60_000 })

    const promos = await api(await sessionToken(page), "GET", "/promotions/me")
    const blueberries = promos.body.find((p: { product?: { name: string } }) => p.product?.name === "Blueberries")
    expect(blueberries.status).toBe("ACTIVE")

    const featured = await (await fetch(`${TEST_API}/promotions/featured-products`)).json()
    expect(featured.map((p: { name: string }) => p.name)).toContain("Blueberries")
    await page.goto("/")
    await expect(page.getByText("Blueberries").first()).toBeVisible()
  })
})
