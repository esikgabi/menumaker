import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { waitFor } from "@testing-library/react"
import { TagSelector } from "@/components/meal/tag-selector"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe("TagSelector", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders heading", async () => {
    const membersRes = new Response(JSON.stringify([{ id: "m1", name: "Alice" }]), { status: 200 })
    const tagsRes = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/members") ? membersRes : tagsRes)))

    const result = withAuth(<TagSelector familyId="f1" mealId="m1" />)

    await waitFor(() => {
      expect(result.getByText("Family Members")).toBeInTheDocument()
    })
  })

  it("renders loading state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))

    const result = withAuth(<TagSelector familyId="f1" mealId="m1" />)

    expect(result.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders family members", async () => {
    const membersRes = new Response(JSON.stringify([
      { id: "m1", name: "Alice" },
      { id: "m2", name: "Bob" },
    ]), { status: 200 })
    const tagsRes = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/members") ? membersRes : tagsRes)))

    const result = withAuth(<TagSelector familyId="f1" mealId="m1" />)

    await waitFor(() => {
      expect(result.getByText("Alice")).toBeInTheDocument()
      expect(result.getByText("Bob")).toBeInTheDocument()
    })
  })

  it("renders Like button for untagged members", async () => {
    const membersRes = new Response(JSON.stringify([{ id: "m1", name: "Alice" }]), { status: 200 })
    const tagsRes = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/members") ? membersRes : tagsRes)))

    const result = withAuth(<TagSelector familyId="f1" mealId="m1" />)

    await waitFor(() => {
      expect(result.getByText("Like")).toBeInTheDocument()
    })
  })

  it("renders Liked button for tagged members", async () => {
    const membersRes = new Response(JSON.stringify([{ id: "m1", name: "Alice" }]), { status: 200 })
    const tagsRes = new Response(JSON.stringify([{ id: "t1", familyMemberId: "m1" }]), { status: 200 })
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/members") ? membersRes : tagsRes)))

    const result = withAuth(<TagSelector familyId="f1" mealId="m1" />)

    await waitFor(() => {
      expect(result.getByText("Liked")).toBeInTheDocument()
    })
  })
})
