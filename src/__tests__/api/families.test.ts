import { describe, it, expect, vi } from "vitest"
import { mockSession } from "@/test-utils/auth"
import * as familiesRoute from "@/app/api/families/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    family: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

const { auth } = await import("@/lib/auth")
const { prisma } = await import("@/lib/prisma")

function createRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  })
}

describe("GET /api/families", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await familiesRoute.GET(createRequest("http://localhost/api/families"))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
  })

  it("returns 401 when user.id is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} as any, expires: "2099-01-01T00:00:00Z" })

    const res = await familiesRoute.GET(createRequest("http://localhost/api/families"))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
  })

  it("returns families for authenticated user", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findMany).mockResolvedValue([])

    const res = await familiesRoute.GET(createRequest("http://localhost/api/families"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([])
    expect(prisma.family.findMany).toHaveBeenCalledWith({
      where: { ownerId: "test-user" },
      include: { members: true },
    })
  })

  it("returns families with members included", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findMany).mockResolvedValue([
      {
        id: "family-1",
        name: "Test Family",
        ownerId: "test-user",
        members: [{ id: "m1", name: "Parent", familyId: "family-1" }],
      },
    ])

    const res = await familiesRoute.GET(createRequest("http://localhost/api/families"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe("Test Family")
  })
})

describe("POST /api/families", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await familiesRoute.POST(
      createRequest("http://localhost/api/families", {
        method: "POST",
        body: JSON.stringify({ name: "Test Family" }),
      })
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when name is missing", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)

    const res = await familiesRoute.POST(
      createRequest("http://localhost/api/families", {
        method: "POST",
        body: JSON.stringify({}),
      })
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: "Name is required" })
  })

  it("creates a family with valid name", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.create).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })

    const res = await familiesRoute.POST(
      createRequest("http://localhost/api/families", {
        method: "POST",
        body: JSON.stringify({ name: "Test Family" }),
      })
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Test Family")
    expect(prisma.family.create).toHaveBeenCalledWith({
      data: { name: "Test Family", ownerId: "test-user" },
    })
  })
})
