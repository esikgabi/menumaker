import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { waitFor } from "@testing-library/react"
import { CookedList } from "@/components/cooked/cooked-list"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe("CookedList", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders cooked meals list", async () => {
    const res = new Response(JSON.stringify([
      {
        id: "c1",
        mealId: "m1",
        familyId: "f1",
        cookedAt: "2025-01-15T10:00:00Z",
        meal: {
          id: "m1",
          name: "Pasta",
          description: "Delicious pasta",
          ingredients: ["pasta", "sauce"],
        },
      },
    ]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<CookedList familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Pasta")).toBeInTheDocument()
    })
  })

  it("shows loading state initially", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))

    const result = withAuth(<CookedList familyId="f1" />)

    expect(result.getByText(/loading cooked meals/i)).toBeInTheDocument()
  })

  it("shows empty state when no cooked meals", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<CookedList familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText(/no cooked meals/i)).toBeInTheDocument()
    })
  })

  it("renders Cook Again button for each meal", async () => {
    const res = new Response(JSON.stringify([
      {
        id: "c1",
        mealId: "m1",
        familyId: "f1",
        cookedAt: "2025-01-15T10:00:00Z",
        meal: {
          id: "m1",
          name: "Pasta",
          ingredients: ["pasta"],
        },
      },
    ]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<CookedList familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Cook Again")).toBeInTheDocument()
    })
  })

  it("renders cooked date", async () => {
    const res = new Response(JSON.stringify([
      {
        id: "c1",
        mealId: "m1",
        familyId: "f1",
        cookedAt: "2025-01-15T10:00:00Z",
        meal: {
          id: "m1",
          name: "Pasta",
          ingredients: ["pasta"],
        },
      },
    ]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<CookedList familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("January 15, 2025")).toBeInTheDocument()
    })
  })

  it("renders check circle icon", async () => {
    const res = new Response(JSON.stringify([
      {
        id: "c1",
        mealId: "m1",
        familyId: "f1",
        cookedAt: "2025-01-15T10:00:00Z",
        meal: {
          id: "m1",
          name: "Pasta",
          ingredients: ["pasta"],
        },
      },
    ]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<CookedList familyId="f1" />)

    await waitFor(() => {
      const svg = result.container.querySelector("svg")
      expect(svg).toBeInTheDocument()
    })
  })
})
