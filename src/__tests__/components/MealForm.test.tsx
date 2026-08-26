import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { fireEvent, waitFor } from "@testing-library/react"
import { MealForm } from "@/components/meal/meal-form"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

describe("MealForm", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders form with labels", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    expect(result.getByText("Name")).toBeInTheDocument()
    expect(result.getByText("Description")).toBeInTheDocument()
  })

  it("renders name input with placeholder", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    const input = result.getByPlaceholderText("e.g., Spaghetti Bolognese")
    expect(input).toBeInTheDocument()
  })

  it("renders description textarea", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    const textarea = result.getByPlaceholderText("Optional description...")
    expect(textarea).toBeInTheDocument()
  })

  it("renders ingredients section", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    expect(result.getByText("Ingredients")).toBeInTheDocument()
  })

  it("renders initial ingredient input", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    expect(result.getByPlaceholderText("Ingredient 1")).toBeInTheDocument()
  })

  it("renders Create Meal button", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    expect(result.getByText("Create Meal")).toBeInTheDocument()
  })

  it("renders Cancel button", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    expect(result.getByText("Cancel")).toBeInTheDocument()
  })

  it("renders Add Ingredient button", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    expect(result.getByText("Add Ingredient")).toBeInTheDocument()
  })

  it("adds ingredient when Add Ingredient is clicked", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    const addButton = result.getByText("Add Ingredient")
    addButton.click()

    await waitFor(() => {
      const inputs = result.container.querySelectorAll('input[placeholder*="Ingredient"]')
      expect(inputs.length).toBe(2)
    })
  })

  it("shows Create Meal as disabled when name is empty", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    const button = result.getByText("Create Meal")
    expect(button).toBeDisabled()
  })

  it("shows Create Meal as enabled when name is provided", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    const input = result.getByPlaceholderText("e.g., Spaghetti Bolognese")
    fireEvent.change(input, { target: { value: "Pasta" } })

    const button = result.getByText("Create Meal")
    expect(button).not.toBeDisabled()
  })

  it("renders remove buttons when more than one ingredient", async () => {
    const result = withAuth(<MealForm familyId="f1" />)

    const addButton = result.getByText("Add Ingredient")
    addButton.click()

    await waitFor(() => {
      const ingredientInputs = result.container.querySelectorAll('input[placeholder*="Ingredient"]')
      expect(ingredientInputs.length).toBe(2)
    })
  })
})
