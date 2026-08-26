import { describe, it, expect, vi, beforeEach } from "vitest"
import { MealCard } from "@/components/meal/meal-card"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe("MealCard", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders meal name", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", ingredients: [] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("Pasta")).toBeInTheDocument()
  })

  it("renders meal description when present", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", description: "Delicious pasta", ingredients: [] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("Delicious pasta")).toBeInTheDocument()
  })

  it("truncates long descriptions", async () => {
    const longDesc = "A".repeat(200)
    const result = <MealCard meal={{ id: "m1", name: "Pasta", description: longDesc, ingredients: [] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    const p = getByText(/A{120}\.{3}/)
    expect(p).toBeInTheDocument()
  })

  it("does not render description when missing", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", ingredients: [] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { queryByText } = render(result, { container })

    expect(queryByText(/description/i)).not.toBeInTheDocument()
  })

  it("renders ingredient count badge", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", ingredients: ["flour", "eggs", "water"] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("3 ingredients")).toBeInTheDocument()
  })

  it("renders ingredient count for single ingredient", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", ingredients: ["flour"] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("1 ingredient")).toBeInTheDocument()
  })

  it("renders Description badge when description exists", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", description: "Delicious", ingredients: [] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("Description")).toBeInTheDocument()
  })

  it("does not render Description badge when no description", async () => {
    const result = <MealCard meal={{ id: "m1", name: "Pasta", ingredients: [] }} familyId="f1" />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { queryByText } = render(result, { container })

    expect(queryByText("Description")).not.toBeInTheDocument()
  })
})
