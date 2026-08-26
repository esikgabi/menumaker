import { auth } from "@/lib/auth"
import { SessionProvider } from "next-auth/react"
import { render } from "@testing-library/react"
import type { RenderOptions } from "@testing-library/react"
import type { ReactNode } from "react"

export interface MockUser {
  id: string
  email: string
  name?: string
  image?: string
}

export interface MockSession {
  user: MockUser
  expires: string
}

function createMockSession(user: MockUser): MockSession {
  return {
    user,
    expires: new Date(Date.now() + 86400000).toISOString(),
  }
}

// For API route tests: return a valid session object
export function mockSession(user: MockUser): MockSession {
  return createMockSession(user)
}

// For component tests: wrap with SessionProvider
export function withAuth(
  ui: ReactNode,
  { user, ...options }: { user: MockUser } & RenderOptions = { user: { id: "test", email: "test@test.com" } }
) {
  const session = createMockSession(user)

  function Wrapper({ children }: { children: ReactNode }) {
    return <SessionProvider session={session}>{children}</SessionProvider>
  }

  return render(ui, { wrapper: Wrapper, ...options })
}
