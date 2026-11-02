import { test, expect, login, sessionToken, api, ADMIN, TEST_API } from "./support"

// Assertions lean on data (emails, store names, toasts) rather than layout,
// so they survive dashboard redesigns.
test.describe("Admin journey", () => {
  test("admin signs in, lands on the admin area and can load platform statistics", async ({ page }) => {
    await login(page, ADMIN)
    await expect(page).toHaveURL(/\/admin/)
    await expect(page.getByText(/application error/i)).toHaveCount(0)
    const stats = await api(await sessionToken(page), "GET", "/admin/stats")
    expect(stats.status).toBe(200)
    expect(stats.body.vendors.approved).toBeGreaterThanOrEqual(10)
    expect(stats.body.products.total).toBeGreaterThanOrEqual(107)
  })

  test("admin rejects and approves the pending vendor from the vendors page", async ({ page }) => {
    await login(page, ADMIN)
    const token = await sessionToken(page)
    const pending = await api(token, "GET", "/admin/vendors/pending")
    const wattle = pending.body.find((v: { storeName: string }) => v.storeName === "Wattle Creek Pastures")
    expect(wattle).toBeTruthy()

    try {
      await page.goto("/admin/vendors")
      const row = () => page.getByRole("row").filter({ hasText: "Wattle Creek Pastures" }).first()
      await expect(row()).toBeVisible()

      await row().getByRole("button", { name: "Reject" }).click()
      await expect(page.getByText("Vendor rejected")).toBeVisible()

      await row().getByRole("button", { name: "Approve" }).click()
      await expect(page.getByText("Vendor approved!")).toBeVisible()
      const publicVendors = await (await fetch(`${TEST_API}/vendors`)).json()
      expect(publicVendors.map((v: { id: string }) => v.id)).toContain(wattle.id)
    } finally {
      // Return the sample vendor to "pending" so the fixture stays reusable.
      await api(token, "POST", `/admin/vendors/${wattle.id}/reject`)
    }
    const after = await (await fetch(`${TEST_API}/vendors`)).json()
    expect(after.map((v: { id: string }) => v.id)).not.toContain(wattle.id)
  })

  test("admin creates, renames and deletes a category", async ({ page }) => {
    await login(page, ADMIN)
    await page.goto("/admin/categories")
    const name = `E2E UI Category ${Date.now()}`

    await page.getByRole("button", { name: "Add Category" }).click()
    await page.getByPlaceholder("e.g. Organic Produce").fill(name)
    await expect(page.getByPlaceholder("e.g. organic-produce")).toHaveValue(/^e2e-ui-category-\d+$/)
    await page.getByRole("button", { name: "Create" }).click()
    await expect(page.getByText("Category created!")).toBeVisible()

    const row = page.getByRole("row").filter({ hasText: name })
    await row.getByRole("button").first().click()
    await page.getByPlaceholder("e.g. Organic Produce").fill(`${name} Renamed`)
    await page.getByRole("button", { name: "Save Changes" }).click()
    await expect(page.getByText("Category updated!")).toBeVisible()

    const renamed = page.getByRole("row").filter({ hasText: `${name} Renamed` })
    await renamed.getByRole("button", { name: "Delete category" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
    await expect(page.getByText("Category deleted!")).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0)

    // Categories that still hold products cannot be deleted.
    const beefRow = page.getByRole("row").filter({ hasText: "beef" }).first()
    await expect(beefRow.getByRole("button", { name: "Cannot delete category with products" })).toBeDisabled()
  })

  test("admin sees orders, users, promotions and settings", async ({ page }) => {
    await login(page, ADMIN)

    // The newest order (by any customer) must be listed, identified by its short id.
    const orders = await api(await sessionToken(page), "GET", "/admin/orders")
    const newest = orders.body[0] as { id: string }
    await page.goto("/admin/orders")
    await expect(page.getByRole("row").filter({ hasText: `#${newest.id.slice(0, 8).toUpperCase()}` }).first()).toBeVisible()

    await page.goto("/admin/users")
    await expect(page.getByText("greenvalley@example.com").first()).toBeVisible()

    await page.goto("/admin/vendors")
    await page.getByRole("tab", { name: /All Vendors/ }).click()
    await expect(page.getByText("Coastal Seafood Farm").first()).toBeVisible()

    await page.goto("/admin/promotions")
    await expect(page.getByText(/Blueberries|Sunny Acres Farm/).first()).toBeVisible()

    await page.goto("/admin/settings")
    await expect(page.getByText(/commission/i).first()).toBeVisible()
  })
})
