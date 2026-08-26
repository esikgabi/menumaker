import { NextResponse } from "next/server"
import { auth, signIn } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST() {
  if (!process.env.MOCK_AUTH_ENABLED) {
    return NextResponse.json({ error: "Mock auth not enabled" }, { status: 403 })
  }

  const mockUser = {
    name: "Mock User",
    email: "mock@example.com",
    image: "https://ui-avatars.com/api/?name=Mock+User",
  }

  // Create or update user in database (same as Google OAuth callback)
  const user = await prisma.user.upsert({
    where: { email: mockUser.email },
    update: { name: mockUser.name, image: mockUser.image, emailVerified: new Date() },
    create: {
      id: "mock-user-1",
      name: mockUser.name,
      email: mockUser.email,
      image: mockUser.image,
      emailVerified: new Date(),
    },
  })

  await signIn("google", { redirect: false })

  const session = await auth()

  return NextResponse.json({ user: session?.user ?? mockUser })
}
