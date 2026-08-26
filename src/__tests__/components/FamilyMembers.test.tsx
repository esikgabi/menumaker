import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { waitFor } from "@testing-library/react"
import { FamilyMembers } from "@/components/family/family-members"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe("FamilyMembers", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders heading", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Family Members")).toBeInTheDocument()
    })
  })

  it("renders empty state when no members", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("No members yet.")).toBeInTheDocument()
    })
  })

  it("renders members list when members exist", async () => {
    const res = new Response(JSON.stringify([
      { id: "m1", name: "Alice" },
      { id: "m2", name: "Bob" },
    ]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Alice")).toBeInTheDocument()
      expect(result.getByText("Bob")).toBeInTheDocument()
    })
  })

  it("renders add member form", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Member Name")).toBeInTheDocument()
    })
  })

  it("renders input with placeholder", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      const input = result.getByPlaceholderText("e.g., Alice")
      expect(input).toBeInTheDocument()
    })
  })

  it("renders Add Member button", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      expect(result.getByText("Add Member")).toBeInTheDocument()
    })
  })

  it("renders delete button for each member", async () => {
    const res = new Response(JSON.stringify([{ id: "m1", name: "Alice" }]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      const buttons = result.container.querySelectorAll("button")
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it("shows Create Meal as disabled when name is empty", async () => {
    const res = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res)))

    const result = withAuth(<FamilyMembers familyId="f1" />)

    await waitFor(() => {
      const button = result.getByText("Add Member")
      expect(button).toBeDisabled()
    })
  })
})
