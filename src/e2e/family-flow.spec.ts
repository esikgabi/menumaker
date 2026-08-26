import { test, expect } from "@playwright/test"

test.describe("Family Flow", () => {
  test("shows empty state on families page", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await expect(page.getByText("No families yet. Create your first family!")).toBeVisible()
  })

  test("create family link exists", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await expect(page.getByRole("link", { name: "Create Family" })).toBeVisible()
  })

  test("create a family and view details", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    const url = page.url()
    const familyId = url.match(/\/families\/([^/]+)/)?.[1]
    expect(familyId).toBeTruthy()

    await expect(page.getByRole("heading", { name: "Test Family" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to Families" })).toBeVisible()
  })

  test("add members to family", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Member Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await expect(page.getByRole("heading", { name: "Family Members" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Member Name" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Member Name" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Add Member" })).toBeVisible()
  })

  test("family card shows member count", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Card Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await page.getByRole("link", { name: "Back to Families" }).click()
    await page.waitForURL(/\/families/)

    await expect(page.getByRole("link", { name: "Card Test Family" })).toBeVisible()
  })

  test("navigate between family pages via links", async ({ page }) => {
    await page.goto("/auth/signin")
    await page.getByRole("button", { name: "Mock Sign In" }).click()
    await page.waitForURL(/\/families/)
    await page.getByRole("link", { name: "Create Family" }).click()
    await page.waitForURL(/\/families\/new/)

    await page.getByLabel("Family Name").fill("Navigation Test Family")
    await page.getByRole("button", { name: /Create|Submit/ }).click()
    await page.waitForURL(/\/families\/[^/]+/)

    await expect(page.getByRole("link", { name: "View Meals" })).toBeVisible()
    await expect(page.getByRole("link", { name: "View Menu" })).toBeVisible()
  })
})
