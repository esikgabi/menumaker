import { describe, it, expect, vi } from "vitest"
import { mockSession } from "@/test-utils/auth"
import * as familyDetailRoute from "@/app/api/families/[id]/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    family: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mealTag: { deleteMany: vi.fn() },
    cookedMeal: { deleteMany: vi.fn() },
    weeklyMenu: { deleteMany: vi.fn() },
    meal: { deleteMany: vi.fn() },
    familyMember: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
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

function createParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/families/[id]", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await familyDetailRoute.GET(createRequest("http://localhost/api/families/test-id"), createParams("test-id"))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
  })

  it("returns 404 when family not found", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue(null)

    const res = await familyDetailRoute.GET(
      createRequest("http://localhost/api/families/test-id"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns 404 when family exists but user is not owner", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Other Family",
      ownerId: "other-user",
    })

    const res = await familyDetailRoute.GET(
      createRequest("http://localhost/api/families/test-id"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns family when owned by user", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
      members: [{ id: "m1", name: "Parent", familyId: "family-1" }],
    })

    const res = await familyDetailRoute.GET(
      createRequest("http://localhost/api/families/test-id"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Test Family")
    expect(prisma.family.findUnique).toHaveBeenCalledWith({
      where: { id: "test-id" },
      include: { members: true },
    })
  })
})

describe("PUT /api/families/[id]", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await familyDetailRoute.PUT(
      createRequest("http://localhost/api/families/test-id", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Name" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
  })

  it("returns 404 when family not found", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue(null)

    const res = await familyDetailRoute.PUT(
      createRequest("http://localhost/api/families/test-id", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Name" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns 400 when name is missing", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Old Name",
      ownerId: "test-user",
    })

    const res = await familyDetailRoute.PUT(
      createRequest("http://localhost/api/families/test-id", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: "Name is required" })
  })

  it("updates family name when valid", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Old Name",
      ownerId: "test-user",
    })
    vi.mocked(prisma.family.update).mockResolvedValue({
      id: "family-1",
      name: "Updated Name",
      ownerId: "test-user",
    })

    const res = await familyDetailRoute.PUT(
      createRequest("http://localhost/api/families/test-id", {
        method: "PUT",
        body: JSON.stringify({ name: "Updated Name" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Updated Name")
  })
})

describe("DELETE /api/families/[id]", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await familyDetailRoute.DELETE(
      createRequest("http://localhost/api/families/test-id", { method: "DELETE" }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ error: "Unauthorized" })
  })

  it("returns 404 when family not found", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue(null)

    const res = await familyDetailRoute.DELETE(
      createRequest("http://localhost/api/families/test-id", { method: "DELETE" }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("deletes family and all related records when owned by user", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.mealTag.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.cookedMeal.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.weeklyMenu.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.meal.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.familyMember.deleteMany).mockResolvedValue({ count: 0 })
    vi.mocked(prisma.family.delete).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })

    const res = await familyDetailRoute.DELETE(
      createRequest("http://localhost/api/families/test-id", { method: "DELETE" }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
  })
})
