import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { FamilyCard } from "@/components/family/family-card"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe("FamilyCard", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders family name", async () => {
    const result = <FamilyCard family={{ id: "f1", name: "The Smiths", members: [], owner: { email: "alice@example.com" } }} />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("The Smiths")).toBeInTheDocument()
  })

  it("renders member count", async () => {
    const result = <FamilyCard family={{ id: "f1", name: "The Smiths", members: [{ id: "m1" }, { id: "m2" }], owner: { email: "alice@example.com" } }} />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("Members: 2")).toBeInTheDocument()
  })

  it("renders owner name when present", async () => {
    const result = <FamilyCard family={{ id: "f1", name: "The Smiths", members: [], owner: { name: "Alice", email: "alice@example.com" } }} />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("Owner: Alice")).toBeInTheDocument()
  })

  it("renders owner email when name is missing", async () => {
    const result = <FamilyCard family={{ id: "f1", name: "The Smiths", members: [], owner: { email: "alice@example.com" } }} />
    const container = document.createElement("div")
    document.body.appendChild(container)
    const { render } = await import("@testing-library/react")
    const { getByText } = render(result, { container })

    expect(getByText("Owner: alice@example.com")).toBeInTheDocument()
  })
})
