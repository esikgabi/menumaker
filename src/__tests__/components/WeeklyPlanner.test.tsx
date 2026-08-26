import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { waitFor } from "@testing-library/react"
import { WeeklyPlanner } from "@/components/menu/weekly-planner"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe("WeeklyPlanner", () => {
  it("renders weekly planner with day labels", async () => {
    const menuRes = new Response(JSON.stringify([]), { status: 200 })
    const mealsRes = new Response(JSON.stringify([{ id: "m1", name: "Pasta" }]), { status: 200 })
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes("/menu") ? menuRes : mealsRes))
    vi.spyOn(window, "fetch").mockImplementation(fetchMock as never)

    const result = withAuth(<WeeklyPlanner familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Mon")).toBeInTheDocument()
      expect(result.getByText("Tue")).toBeInTheDocument()
      expect(result.getByText("Wed")).toBeInTheDocument()
      expect(result.getByText("Thu")).toBeInTheDocument()
      expect(result.getByText("Fri")).toBeInTheDocument()
      expect(result.getByText("Sat")).toBeInTheDocument()
      expect(result.getByText("Sun")).toBeInTheDocument()
    })
  })

  it("shows loading state initially", async () => {
    vi.spyOn(window, "fetch").mockImplementation(() => new Promise(() => {}))

    const result = withAuth(<WeeklyPlanner familyId="f1" />)

    expect(result.getByText(/loading menu/i)).toBeInTheDocument()
  })

  it("renders meal options in select dropdown", async () => {
    const menuRes = new Response(JSON.stringify([]), { status: 200 })
    const mealsRes = new Response(JSON.stringify([
      { id: "m1", name: "Pasta" },
      { id: "m2", name: "Pizza" },
    ]), { status: 200 })
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes("/menu") ? menuRes : mealsRes))
    vi.spyOn(window, "fetch").mockImplementation(fetchMock as never)

    const result = withAuth(<WeeklyPlanner familyId="f1" />)

    await waitFor(() => {
      const triggers = result.container.querySelectorAll('[role="combobox"]')
      expect(triggers.length).toBeGreaterThan(0)
    })
  })

  it("renders select with 'Select a meal' placeholder", async () => {
    const menuRes = new Response(JSON.stringify([]), { status: 200 })
    const mealsRes = new Response(JSON.stringify([{ id: "m1", name: "Pasta" }]), { status: 200 })
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes("/menu") ? menuRes : mealsRes))
    vi.spyOn(window, "fetch").mockImplementation(fetchMock as never)

    const result = withAuth(<WeeklyPlanner familyId="f1" />)

    await waitFor(() => {
      const trigger = result.container.querySelector('[role="combobox"]')
      expect(trigger).toHaveTextContent("Select a meal")
    })
  })

  it("renders 'None' option in select", async () => {
    const menuRes = new Response(JSON.stringify([]), { status: 200 })
    const mealsRes = new Response(JSON.stringify([{ id: "m1", name: "Pasta" }]), { status: 200 })
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes("/menu") ? menuRes : mealsRes))
    vi.spyOn(window, "fetch").mockImplementation(fetchMock as never)

    const result = withAuth(<WeeklyPlanner familyId="f1" />)

    await waitFor(() => {
      const triggers = result.container.querySelectorAll('[role="combobox"]')
      expect(triggers.length).toBeGreaterThan(0)
    })
  })
})
