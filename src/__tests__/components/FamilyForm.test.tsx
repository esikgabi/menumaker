import { describe, it, expect, vi, beforeEach } from "vitest"
import { withAuth } from "@/test-utils/auth"
import { fireEvent, waitFor } from "@testing-library/react"
import { FamilyForm } from "@/components/family/family-form"

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

describe("FamilyForm", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("renders form with label", async () => {
    const result = withAuth(<FamilyForm />)

    expect(result.getByText("Family Name")).toBeInTheDocument()
  })

  it("renders input with placeholder", async () => {
    const result = withAuth(<FamilyForm />)

    const input = result.getByPlaceholderText("e.g., The Smiths")
    expect(input).toBeInTheDocument()
  })

  it("renders Create Family button", async () => {
    const result = withAuth(<FamilyForm />)

    expect(result.getByText("Create Family")).toBeInTheDocument()
  })

  it("shows Create Family as disabled when name is empty", async () => {
    const result = withAuth(<FamilyForm />)

    const button = result.getByText("Create Family")
    expect(button).toBeDisabled()
  })

  it("shows Create Family as enabled when name is provided", async () => {
    const result = withAuth(<FamilyForm />)

    const input = result.getByPlaceholderText("e.g., The Smiths")
    fireEvent.change(input, { target: { value: "The Smiths" } })

    const button = result.getByText("Create Family")
    expect(button).not.toBeDisabled()
  })

  it("renders error message when present", async () => {
    const res = new Response(JSON.stringify({ error: "Name is required" }), { status: 400 })
    const fetchMock = vi.fn(() => Promise.resolve(res))
    vi.spyOn(window, "fetch").mockImplementation(fetchMock as never)

    const result = withAuth(<FamilyForm />)

    const input = result.getByPlaceholderText("e.g., The Smiths")
    fireEvent.change(input, { target: { value: "The Smiths" } })

    const button = result.getByText("Create Family")
    fireEvent.click(button)

    await waitFor(() => {
      const error = result.getByText("Name is required")
      expect(error).toBeInTheDocument()
    })
  })
})
