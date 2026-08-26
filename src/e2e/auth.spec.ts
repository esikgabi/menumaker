import { test, expect } from "@playwright/test"

test.describe("Auth Flow", () => {
  test("redirects unauthenticated user to signin", async ({ page }) => {
    await page.goto("/families")
    await expect(page).toHaveURL(/\/auth\/signin/)
    await expect(page.getByRole("heading", { name: "MenuMaker" })).toBeVisible()
  })

  test("mock sign-in button exists on signin page", async ({ page }) => {
    await page.goto("/auth/signin")
    await expect(page.getByRole("button", { name: "Mock Sign In" })).toBeVisible()
  })

  test("mock sign-in logs user in and redirects to families", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await expect(page.getByRole("heading", { name: "My Families" })).toBeVisible()
  })

  test("shows sign-in link in navbar when not authenticated", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible()
  })

  test("shows log-out button in navbar when authenticated", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await expect(page.getByRole("button", { name: "Sign Out", exact: false })).toBeVisible()
  })
})
