import { test, expect } from "@playwright/test"

test.describe("Menu Flow", () => {
  test("weekly menu planner page renders", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Menu Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Menu" }).click()
    await page.waitForURL(/\/menu$/)
    await expect(page.getByRole("heading", { name: "Weekly Menu Planner" })).toBeVisible()
  })

  test("weekly planner shows all days", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Days Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Menu" }).click()
    await page.waitForURL(/\/menu$/)

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for (const day of days) {
      await expect(page.getByRole("heading", { name: day })).toBeVisible()
    }
  })

  test("weekly planner has select dropdowns", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Select Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Menu" }).click()
    await page.waitForURL(/\/menu$/)

    const triggers = page.getByRole("combobox")
    await expect(triggers).toHaveCount(7)
  })

  test("cooked meals page renders", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Cooked Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "Cooked" }).click()
    await page.waitForURL(/\/cooked$/)
    await expect(page.getByRole("heading", { name: "Cooked Meals" })).toBeVisible()
  })

  test("cooked meals shows empty state", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Empty Cooked Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "Cooked" }).click()
    await page.waitForURL(/\/cooked$/)
    await expect(page.getByText("No cooked meals yet. Start cooking your favorite meals!")).toBeVisible()
  })

  test("navigate between family sub-pages", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Sub Nav Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Meals" }).click()
    await page.waitForURL(/\/meals$/)

    await page.getByRole("link", { name: "Back to Families" }).click()
    await page.waitForURL(/\/families\/[^/]+$/)

    await page.getByRole("link", { name: "View Menu" }).click()
    await page.waitForURL(/\/menu$/)
  })
})
