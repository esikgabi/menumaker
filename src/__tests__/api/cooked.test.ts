import { describe, it, expect, vi } from "vitest"
import { mockSession } from "@/test-utils/auth"
import * as cookedRoute from "@/app/api/families/[id]/cooked/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    family: { findUnique: vi.fn() },
    meal: { findUnique: vi.fn() },
    cookedMeal: {
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

function createParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe("GET /api/families/[id]/cooked", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await cookedRoute.GET(
      createRequest("http://localhost/api/families/test-id/cooked"),
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

    const res = await cookedRoute.GET(
      createRequest("http://localhost/api/families/test-id/cooked"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns cooked meals for authenticated family owner", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.cookedMeal.findMany).mockResolvedValue([])

    const res = await cookedRoute.GET(
      createRequest("http://localhost/api/families/test-id/cooked"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([])
  })

  it("returns cooked meals ordered by cookedAt desc", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.cookedMeal.findMany).mockResolvedValue([
      {
        id: "cm-1",
        mealId: "meal-1",
        familyId: "family-1",
        cookedAt: new Date("2024-01-15"),
        meal: { id: "meal-1", name: "Pasta" },
      },
    ])

    const res = await cookedRoute.GET(
      createRequest("http://localhost/api/families/test-id/cooked"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(prisma.cookedMeal.findMany).toHaveBeenCalledWith({
      where: { familyId: "test-id" },
      include: { meal: true },
      orderBy: { cookedAt: "desc" },
    })
  })
})

describe("POST /api/families/[id]/cooked", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await cookedRoute.POST(
      createRequest("http://localhost/api/families/test-id/cooked", {
        method: "POST",
        body: JSON.stringify({ mealId: "meal-1" }),
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

    const res = await cookedRoute.POST(
      createRequest("http://localhost/api/families/test-id/cooked", {
        method: "POST",
        body: JSON.stringify({ mealId: "meal-1" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns 400 when mealId is missing", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })

    const res = await cookedRoute.POST(
      createRequest("http://localhost/api/families/test-id/cooked", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: "Meal ID is required" })
  })

  it("returns 404 when meal does not belong to family", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.findUnique).mockResolvedValue(null)

    const res = await cookedRoute.POST(
      createRequest("http://localhost/api/families/test-id/cooked", {
        method: "POST",
        body: JSON.stringify({ mealId: "nonexistent-meal" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Meal not found" })
  })

  it("returns 404 when meal belongs to different family", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.findUnique).mockResolvedValue(null)

    const res = await cookedRoute.POST(
      createRequest("http://localhost/api/families/test-id/cooked", {
        method: "POST",
        body: JSON.stringify({ mealId: "meal-1" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Meal not found" })
  })

  it("creates a cooked meal entry", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.findUnique).mockResolvedValue({
      id: "meal-1",
      name: "Pasta",
      familyId: "family-1",
    })
    vi.mocked(prisma.cookedMeal.create).mockResolvedValue({
      id: "cm-1",
      mealId: "meal-1",
      familyId: "family-1",
      cookedAt: new Date("2024-01-15"),
    })

    const res = await cookedRoute.POST(
      createRequest("http://localhost/api/families/test-id/cooked", {
        method: "POST",
        body: JSON.stringify({ mealId: "meal-1" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.mealId).toBe("meal-1")
  })
})
