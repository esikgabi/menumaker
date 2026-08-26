import { describe, it, expect, vi } from "vitest"
import { mockSession } from "@/test-utils/auth"
import * as mealsRoute from "@/app/api/families/[id]/meals/route"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    family: { findUnique: vi.fn() },
    meal: {
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

describe("GET /api/families/[id]/meals", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await mealsRoute.GET(
      createRequest("http://localhost/api/families/test-id/meals"),
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

    const res = await mealsRoute.GET(
      createRequest("http://localhost/api/families/test-id/meals"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "Family not found" })
  })

  it("returns meals for authenticated family owner", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.findMany).mockResolvedValue([])

    const res = await mealsRoute.GET(
      createRequest("http://localhost/api/families/test-id/meals"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([])
  })

  it("returns meals with tags and member info", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.findMany).mockResolvedValue([
      {
        id: "meal-1",
        name: "Pasta",
        familyId: "family-1",
        tags: [
          {
        id: "tag-1",
        name: "Italian",
        familyId: "family-1",
        mealId: "meal-1",
        familyMember: { id: "m1", name: "Parent", familyId: "family-1" },
      },
        ],
      },
    ])

    const res = await mealsRoute.GET(
      createRequest("http://localhost/api/families/test-id/meals"),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe("Pasta")
  })
})

describe("POST /api/families/[id]/meals", () => {
  it("returns 401 without session", async () => {
    vi.mocked(auth).mockResolvedValue(null)

    const res = await mealsRoute.POST(
      createRequest("http://localhost/api/families/test-id/meals", {
        method: "POST",
        body: JSON.stringify({ name: "Test Meal" }),
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

    const res = await mealsRoute.POST(
      createRequest("http://localhost/api/families/test-id/meals", {
        method: "POST",
        body: JSON.stringify({ name: "Test Meal" }),
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
      name: "Test Family",
      ownerId: "test-user",
    })

    const res = await mealsRoute.POST(
      createRequest("http://localhost/api/families/test-id/meals", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: "Name is required" })
  })

  it("creates a meal when valid", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.create).mockResolvedValue({
      id: "meal-1",
      name: "Test Meal",
      description: "A test meal",
      ingredients: ["ingredient1"],
      familyId: "family-1",
    })

    const res = await mealsRoute.POST(
      createRequest("http://localhost/api/families/test-id/meals", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Meal",
          description: "A test meal",
          ingredients: ["ingredient1"],
        }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Test Meal")
  })

  it("creates a meal with undefined description when not provided", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    vi.mocked(auth).mockResolvedValue(session)
    vi.mocked(prisma.family.findUnique).mockResolvedValue({
      id: "family-1",
      name: "Test Family",
      ownerId: "test-user",
    })
    vi.mocked(prisma.meal.create).mockResolvedValue({
      id: "meal-1",
      name: "Simple Meal",
      description: undefined,
      ingredients: [],
      familyId: "family-1",
    })

    const res = await mealsRoute.POST(
      createRequest("http://localhost/api/families/test-id/meals", {
        method: "POST",
        body: JSON.stringify({ name: "Simple Meal" }),
      }),
      createParams("test-id")
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Simple Meal")
  })
})
