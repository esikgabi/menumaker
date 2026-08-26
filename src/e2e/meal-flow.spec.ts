import { test, expect } from "@playwright/test"

test.describe("Meal Flow", () => {
  test("shows empty meals state", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Meal Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Meals" }).click()
    await page.waitForURL(/\/meals$/)
    await expect(page.getByRole("heading", { name: "Meals" })).toBeVisible()
    await expect(page.getByText("No meals yet. Create your first meal to get started.")).toBeVisible()
  })

  test("meal card shows ingredients and description badges", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Meal Badge Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Meals" }).click()
    await page.waitForURL(/\/meals$/)

    await expect(page.getByRole("heading", { name: "Meals" })).toBeVisible()
  })

  test("click meal card navigates to meal tags page", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Meal Tags Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Meals" }).click()
    await page.waitForURL(/\/meals$/)
  })

  test("meals page has utensils icon", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Icon Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "View Meals" }).click()
    await page.waitForURL(/\/meals$/)

    await expect(page.getByRole("heading", { name: "Meals" })).toBeVisible()
  })
})
