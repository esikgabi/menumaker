import { describe, it, expect, vi, beforeEach } from "vitest"
import { requireAuth } from "@/components/auth/auth-guard"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("redirects when no session", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue(null)

    await expect(requireAuth()).rejects.toThrow()
  })

  it("returns session when authenticated", async () => {
    const { auth } = await import("@/lib/auth")
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "test@test.com" } } as any)

    const session = await requireAuth()
    expect(session).toBeDefined()
  })
})
