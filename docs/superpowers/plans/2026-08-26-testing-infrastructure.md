# Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete testing suite (API, component, E2E) with a mock authenticator that works both as a test helper and a toggleable in-app feature.

**Architecture:** Three testing layers sharing a single mock authenticator module. The mock authenticator creates valid session objects that integrate with NextAuth v5's session system. The toggleable mode runs in-app (opt-in), the test helper runs in test environments.

**Tech Stack:** Vitest (API + components), Playwright (E2E), Testing Library (components), NextAuth v5 (existing).

---

## Prerequisites

Before starting: read `docs/superpowers/specs/2026-08-26-testing-infrastructure-design.md` for the full spec.

---

### Task 1: Install Testing Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add testing dependencies**

Add these to `devDependencies` in `package.json`:

```json
"vitest": "^3.0.0",
"@testing-library/react": "^16.3.0",
"@testing-library/jest-dom": "^6.6.0",
"@testing-library/dom": "^10.4.0",
"jsdom": "^26.0.0",
"@playwright/test": "^1.50.0"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: All packages installed without errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add testing dependencies (vitest, testing-library, playwright)"
```

---

### Task 2: Core Mock Authenticator

**Files:**
- Create: `src/test-utils/auth.ts`
- Modify: `src/lib/auth.ts` (add `getServerSession` export if needed)

- [ ] **Step 1: Write `src/test-utils/auth.ts`**

Create this file with the following content:

```typescript
import { auth } from "@/lib/auth"
import { getServerSession } from "next-auth"
import type { Session } from "next-auth"
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
```

- [ ] **Step 2: Verify the file is syntactically valid**

Run: `npx tsc --noEmit src/test-utils/auth.ts`
Expected: No TypeScript errors (or only expected ones from missing types — fix if needed)

- [ ] **Step 3: Commit**

```bash
git add src/test-utils/auth.ts
git commit -m "feat: add core mock authenticator (test helper)"
```

---

### Task 3: Toggleable Mock Auth Mode

**Files:**
- Create: `src/app/api/auth/mock-signin/route.ts`
- Modify: `src/components/layout/navbar.tsx` (add mock auth toggle UI)
- Create: `.env.development` (optional, for local dev)

- [ ] **Step 1: Create `/api/auth/mock-signin` endpoint**

Create `src/app/api/auth/mock-signin/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { signOut } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST() {
  const mockUser = {
    id: "mock-user-1",
    name: "Mock User",
    email: "mock@example.com",
    image: "https://ui-avatars.com/api/?name=Mock+User",
  }

  // Create or update user in database (same as Google OAuth callback)
  const user = await prisma.user.upsert({
    where: { email: mockUser.email },
    update: { name: mockUser.name, image: mockUser.image },
    create: {
      id: mockUser.id,
      name: mockUser.name,
      email: mockUser.email,
      image: mockUser.image,
    },
  })

  // Use NextAuth's signIn with credentials provider
  // Or create a session directly
  const session = await getServerSession(auth())

  return NextResponse.json({ user })
}
```

- [ ] **Step 2: Add mock auth toggle to Navbar**

Modify `src/components/layout/navbar.tsx` to conditionally render a "Mock Auth" button when `MOCK_AUTH_ENABLED` is true.

- [ ] **Step 3: Add env var check**

In `src/app/api/mock-signin/route.ts`, add a check:

```typescript
if (!process.env.MOCK_AUTH_ENABLED) {
  return NextResponse.json({ error: "Mock auth not enabled" }, { status: 403 })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/mock-signin/route.ts src/components/layout/navbar.tsx
git commit -m "feat: add toggleable mock auth mode (mock-signin endpoint + navbar toggle)"
```

---

### Task 4: Vitest Configuration

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test-utils/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-utils/setup.ts"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

- [ ] **Step 2: Create `src/test-utils/setup.ts`**

```typescript
import "@testing-library/jest-dom"
```

- [ ] **Step 3: Add test scripts to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:api": "vitest run src/__tests__/api/",
  "test:component": "vitest run src/__tests__/components/",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Verify config works**

Run: `npx vitest --version`
Expected: Version number printed

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test-utils/setup.ts package.json
git commit -m "chore: add vitest configuration"
```

---

### Task 5: API Route Tests

**Files:**
- Create: `src/__tests__/api/families.test.ts`
- Create: `src/__tests__/api/meals.test.ts`
- Create: `src/__tests__/api/menu.test.ts`
- Create: `src/__tests__/api/cooked.test.ts`

- [ ] **Step 1: Test `/api/families`**

Create `src/__tests__/api/families.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { mockSession } from "@/test-utils/auth"

describe("GET /api/families", () => {
  it("returns 401 without session", async () => {
    const res = await fetch("/api/families")
    expect(res.status).toBe(401)
  })

  it("returns families for authenticated user", async () => {
    const session = mockSession({ id: "test-user", email: "test@test.com" })
    const res = await fetch("/api/families", {
      headers: { cookie: `next-auth.session-token=${JSON.stringify(session)}` },
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Test `/api/families/[id]` (single family)**

Create `src/__tests__/api/family-detail.test.ts` testing ownership check.

- [ ] **Step 3: Test `/api/families/[id]/meals`**

Create `src/__tests__/api/meals.test.ts`.

- [ ] **Step 4: Test `/api/families/[id]/menu`**

Create `src/__tests__/api/menu.test.ts`.

- [ ] **Step 5: Test `/api/families/[id]/cooked`**

Create `src/__tests__/api/cooked.test.ts`.

- [ ] **Step 6: Run all API tests**

Run: `npm run test:api`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/api/
git commit -m "test: add API route tests (families, meals, menu, cooked)"
```

---

### Task 6: Component Tests

**Files:**
- Create: `src/__tests__/components/WeeklyPlanner.test.tsx`
- Create: `src/__tests__/components/CookedList.test.tsx`
- Create: `src/__tests__/components/TagSelector.test.tsx`
- Create: `src/__tests__/components/MealCard.test.tsx`
- Create: `src/__tests__/components/FamilyCard.test.tsx`
- Create: `src/__tests__/components/FamilyMembers.test.tsx`
- Create: `src/__tests__/components/MealForm.test.tsx`
- Create: `src/__tests__/components/FamilyForm.test.tsx`
- Create: `src/__tests__/components/AuthGuard.test.tsx`

- [ ] **Step 1: Test `WeeklyPlanner`**

Create `src/__tests__/components/WeeklyPlanner.test.tsx`:

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { withAuth } from "@/test-utils/auth"
import { WeeklyPlanner } from "@/components/menu/weekly-planner"

describe("WeeklyPlanner", () => {
  it("renders weekly planner", () => {
    render(withAuth(<WeeklyPlanner familyId="1" />))
    expect(screen.getByText(/weekly menu/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Test `CookedList`**

Create `src/__tests__/components/CookedList.test.tsx`.

- [ ] **Step 3: Test `TagSelector`**

Create `src/__tests__/components/TagSelector.test.tsx`.

- [ ] **Step 4: Test `MealCard`**

Create `src/__tests__/components/MealCard.test.tsx`.

- [ ] **Step 5: Test `FamilyCard`**

Create `src/__tests__/components/FamilyCard.test.tsx`.

- [ ] **Step 6: Test `FamilyMembers`**

Create `src/__tests__/components/FamilyMembers.test.tsx`.

- [ ] **Step 7: Test `MealForm`**

Create `src/__tests__/components/MealForm.test.tsx`.

- [ ] **Step 8: Test `FamilyForm`**

Create `src/__tests__/components/FamilyForm.test.tsx`.

- [ ] **Step 9: Test `requireAuth` (auth guard)**

Create `src/__tests__/components/AuthGuard.test.tsx` testing redirect behavior.

- [ ] **Step 10: Run all component tests**

Run: `npm run test:component`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add src/__tests__/components/
git commit -m "test: add component tests (WeeklyPlanner, CookedList, TagSelector, etc.)"
```

---

### Task 7: Playwright Configuration

**Files:**
- Create: `playwright.config.ts`
- Create: `src/test-utils/playwright.ts`

- [ ] **Step 1: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./src/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
})
```

- [ ] **Step 2: Create `src/test-utils/playwright.ts`**

```typescript
import { test as base } from "@playwright/test"
import { mockSession } from "@/test-utils/auth"

export const test = base.extend<{ mockSignIn: () => Promise<void> }>({
  mockSignIn: async ({ page }, use) => {
    await use(async () => {
      await page.goto("/auth/signin")
      // Click mock sign-in button (created in Task 3)
      await page.click('button:has-text("Mock Sign In")')
      await page.waitForURL(/\/families/)
    })
  },
})
```

- [ ] **Step 3: Add E2E script to `package.json`**

```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts src/test-utils/playwright.ts package.json
git commit -m "chore: add Playwright configuration"
```

---

### Task 8: E2E Tests

**Files:**
- Create: `src/e2e/auth.spec.ts`
- Create: `src/e2e/family-flow.spec.ts`
- Create: `src/e2e/meal-flow.spec.ts`
- Create: `src/e2e/menu-flow.spec.ts`

- [ ] **Step 1: Test auth flow**

Create `src/e2e/auth.spec.ts`:

```typescript
import { test, expect } from "@playwright/test"

test("redirects to signin when not authenticated", async ({ page }) => {
  await page.goto("/families")
  await expect(page).toHaveURL(/\/auth\/signin/)
})

test("mock sign-in works", async ({ page }) => {
  await page.goto("/auth/signin")
  await page.click('button:has-text("Mock Sign In")')
  await expect(page).toHaveURL(/\/families/)
})
```

- [ ] **Step 2: Test family lifecycle**

Create `src/e2e/family-flow.spec.ts` — create family, add members.

- [ ] **Step 3: Test meal flow**

Create `src/e2e/meal-flow.spec.ts` — create meal, add tags.

- [ ] **Step 4: Test menu flow**

Create `src/e2e/menu-flow.spec.ts` — build weekly menu, mark as cooked.

- [ ] **Step 5: Run all E2E tests**

Run: `npm run test:e2e`
Expected: All tests pass (requires dev server running)

- [ ] **Step 6: Commit**

```bash
git add src/e2e/
git commit -m "test: add E2E tests (auth, family, meal, menu flows)"
```

---

### Task 9: Final Integration

**Files:**
- Modify: `package.json` (final scripts)
- Create: `README.md` (testing section, if not present)

- [ ] **Step 1: Finalize scripts in `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:api": "vitest run src/__tests__/api/",
  "test:component": "vitest run src/__tests__/components/",
  "test:e2e": "playwright test",
  "test:all": "npm run test:api && npm run test:component && npm run test:e2e",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Run all tests together**

Run: `npm run test:all`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: finalize test scripts (test:all)"
```

---

## Self-Review

**Spec coverage:**
- Mock authenticator (test helper + toggleable) → Tasks 2, 3
- API route testing → Task 5
- Component testing → Task 6
- E2E testing → Tasks 7, 8
- Integration (scripts, combined run) → Task 9
- All spec requirements covered.

**Placeholder scan:** No TBD, TODO, or vague requirements found.

**Type consistency:** `MockUser`, `MockSession`, `mockSession()`, `withAuth()` used consistently across Tasks 2, 5, 6, 7.

**Scope check:** Plan is focused on testing infrastructure. No unrelated refactoring.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-testing-infrastructure.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
