import { describe, it, expect, vi } from "vitest"
import { mockSession } from "@/test-utils/auth"
import * as menuRoute from "@/app/api/families/[id]/menu/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    family: { findUnique: vi.fn() },
    meal: { findUnique: vi.fn() },
    weeklyMenu: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
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

describe("GET /api/families/[id]/menu", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await menuRoute.GET(
      createRequest("http://localhost/api/families/test-id/menu"),
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

    const res = await menuRoute.GET(
      createRequest("http://localhost/api/families/test-id/menu"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns weekly menus for authenticated family owner", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.weeklyMenu.findMany).mockResolvedValue([])

    const res = await menuRoute.GET(
      createRequest("http://localhost/api/families/test-id/menu"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([])
  })

  it("returns weekly menus ordered by day of week", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.weeklyMenu.findMany).mockResolvedValue([
      {
        id: "wm-1",
        familyId: "family-1",
        dayOfWeek: 1,
        mealId: "meal-1",
        meal: { id: "meal-1", name: "Pasta" },
      },
      {
        id: "wm-2",
        familyId: "family-1",
        dayOfWeek: 0,
        mealId: "meal-2",
        meal: { id: "meal-2", name: "Pizza" },
      },
    ])

    const res = await menuRoute.GET(
      createRequest("http://localhost/api/families/test-id/menu"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(2)
    expect(prisma.weeklyMenu.findMany).toHaveBeenCalledWith({
      where: { familyId: "test-id" },
      include: { meal: true },
      orderBy: { dayOfWeek: "asc" },
    })
  })
})

describe("POST /api/families/[id]/menu", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await menuRoute.POST(
      createRequest("http://localhost/api/families/test-id/menu", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: 1, mealId: "meal-1" }),
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

    const res = await menuRoute.POST(
      createRequest("http://localhost/api/families/test-id/menu", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: 1, mealId: "meal-1" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns 400 when dayOfWeek or mealId is missing", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })

    const res = await menuRoute.POST(
      createRequest("http://localhost/api/families/test-id/menu", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: "dayOfWeek and mealId are required" })
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

    const res = await menuRoute.POST(
      createRequest("http://localhost/api/families/test-id/menu", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: 1, mealId: "nonexistent-meal" }),
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
    vi.mocked(prisma.meal.findUnique).mockResolvedValue({
      id: "meal-1",
      name: "Other Meal",
      familyId: "other-family",
    })

    const res = await menuRoute.POST(
      createRequest("http://localhost/api/families/test-id/menu", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: 1, mealId: "meal-1" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Meal not found" })
  })

  it("creates or updates a weekly menu entry", async () => {
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
      familyId: "test-id",
    })
    vi.mocked(prisma.weeklyMenu.upsert).mockResolvedValue({
      id: "wm-1",
      familyId: "family-1",
      dayOfWeek: 1,
      mealId: "meal-1",
      meal: { id: "meal-1", name: "Pasta" },
    } as any)

    const res = await menuRoute.POST(
      createRequest("http://localhost/api/families/test-id/menu", {
        method: "POST",
        body: JSON.stringify({ dayOfWeek: 1, mealId: "meal-1" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dayOfWeek).toBe(1)
  })
})

describe("DELETE /api/families/[id]/menu", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await menuRoute.DELETE(
      createRequest("http://localhost/api/families/test-id/menu?dayOfWeek=1", { method: "DELETE" }),
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

    const res = await menuRoute.DELETE(
      createRequest("http://localhost/api/families/test-id/menu?dayOfWeek=1", { method: "DELETE" }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns 400 when dayOfWeek is missing", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })

    const res = await menuRoute.DELETE(
      createRequest("http://localhost/api/families/test-id/menu", { method: "DELETE" }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: "dayOfWeek is required" })
  })

  it("deletes a weekly menu entry", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.weeklyMenu.deleteMany).mockResolvedValue({ count: 1 })

    const res = await menuRoute.DELETE(
      createRequest("http://localhost/api/families/test-id/menu?dayOfWeek=1", { method: "DELETE" }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
  })
})
