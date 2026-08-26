# Testing Infrastructure Design

**Date:** 2026-08-26
**Scope:** Full testing suite (API, component, E2E) with mock authenticator

---

## Problem

The menu maker app has zero testing infrastructure. Every page requires authentication via Google OAuth (NextAuth v5), making it impossible to test any page in isolation. There is no test runner, no mocking framework, and no test utilities.

## Solution

Build a complete testing suite with a dual-purpose mock authenticator: a test helper for automated tests AND a toggleable mode for local development.

---

## 1. Mock Authenticator (Core)

### Test Helper (`src/test-utils/auth.ts`)

A module that creates valid session objects for testing.

```typescript
// withAuth(component, { user: { id, email, name, image } })
// Wraps a component with a fake session via SessionProvider

// mockSession(sessionData)
// For API route tests, creates a valid session object
```

### Toggleable Mode (In-App)

When enabled, bypasses Google OAuth and creates a session from a predefined user.

- **Env var:** `MOCK_AUTH_ENABLED` (default: `false`)
- **Endpoint:** `/api/auth/mock-signin` — creates a session with a predefined user
- **UI:** Navbar shows a "Mock Auth" toggle button when enabled
- **Query param:** `?mockAuth=true` — enables mock auth for the session
- **Navbar integration:** Shows a toggle button when `MOCK_AUTH_ENABLED` is true

### Integration

The mock authenticator integrates with the existing NextAuth setup. No changes to production auth logic are required for the test helper. The toggleable mode is opt-in (disabled by default in production).

---

## 2. API Route Testing (Vitest)

### Setup

- Install Vitest + `@testing-library/dom`
- Create `vitest.config.ts`
- Create `src/test-utils/server.ts` for server-side test helpers

### Tests

Test each API route (`/families`, `/meals`, `/menu`, `/cooked`) with and without auth.

**Test cases per route:**
- 401 when no session
- 401 when session user is not owner
- 200 when session user is owner
- 200 when session user is a family member (where applicable)
- Data validation (required fields, type checking)
- Error handling (invalid data, missing relations)

### Usage

```typescript
import { describe, it, expect } from 'vitest'
import { withAuth } from '@/test-utils/auth'

describe('GET /api/families', () => {
  it('returns 401 without session', async () => {
    const res = await fetch('/api/families')
    expect(res.status).toBe(401)
  })

  it('returns families for authenticated user', async () => {
    const { session } = withAuth({ user: { id: '123' } })
    // ... test with session
  })
})
```

---

## 3. Component Testing (Vitest + Testing Library)

### Setup

- Install `@testing-library/react` + `@testing-library/jest-dom`
- Configure Vitest with jsdom environment for React components

### Components to Test

- `WeeklyPlanner` — menu generation, drag-and-drop interactions
- `CookedList` — mark as cooked, filter states
- `TagSelector` — tag selection, filtering
- `MealCard` — rendering, interactions
- `FamilyCard` — rendering, member count
- `FamilyMembers` — add/remove members
- `MealForm` — form validation, submission
- `FamilyForm` — form validation, submission
- Auth guard (`requireAuth`) — redirect behavior

### Usage

```typescript
import { render, screen } from '@testing-library/react'
import { withAuth } from '@/test-utils/auth'

it('renders meal cards', () => {
  render(withAuth(<MealList meals={meals} />))
  expect(screen.getByText(meals[0].name)).toBeInTheDocument()
})
```

---

## 4. End-to-End Testing (Playwright)

### Setup

- Install Playwright
- Create `playwright.config.ts`
- Configure browser fixtures with mock auth

### User Flows to Test

1. **Family lifecycle:** Create family → Add meal → Add tags → Build menu → Mark as cooked
2. **Family management:** Invite members, manage permissions
3. **Auth flows:** Sign in, sign out, auth guard redirects
4. **Error states:** Invalid data, network failures, permission denied

### Usage

```typescript
import { test, expect } from '@playwright/test'

test('create family and add meal', async ({ page }) => {
  await page.goto('/auth/signin')
  // Use mock auth to sign in
  await page.click('button:has-text("Mock Sign In")')
  await page.goto('/families/new')
  await page.fill('input[name="name"]', 'Test Family')
  await page.click('button:has-text("Create")')
  await expect(page).toHaveURL(/\/families\/\w+/)
})
```

---

## 5. Integration Points

### Single Source of Truth

The mock authenticator module (`src/test-utils/auth.ts`) is the single source of truth for session creation. Both the test helper and the toggleable mode use the same underlying logic.

### No Breaking Changes

- Existing API routes that check `auth()` will work with both mock modes
- Toggleable mode is opt-in (disabled by default in production)
- Test helper does not modify production code

### Test Scripts

```json
"test:api": "vitest run src/__tests__/api/",
"test:component": "vitest run src/__tests__/components/",
"test:e2e": "playwright test",
"test:all": "npm run test:api && npm run test:component && npm run test:e2e"
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner (API + components) |
| `@testing-library/react` | Component testing utilities |
| `@testing-library/jest-dom` | DOM matchers |
| `jsdom` | DOM environment for tests |
| `@playwright/test` | E2E browser testing |
| `@types/node` | TypeScript types (if not present) |

---

## File Structure

```
src/
  test-utils/
    auth.ts          # Mock authenticator (test helper + toggleable)
    server.ts        # Server-side test helpers
    setup.ts         # Test setup (globals, mocks)
  __tests__/
    api/
      families.test.ts
      meals.test.ts
      menu.test.ts
      cooked.test.ts
    components/
      WeeklyPlanner.test.tsx
      CookedList.test.tsx
      TagSelector.test.tsx
      MealCard.test.tsx
      FamilyCard.test.tsx
      FamilyMembers.test.tsx
      MealForm.test.tsx
      FamilyForm.test.tsx
      AuthGuard.test.tsx
  e2e/
    auth.spec.ts
    family-flow.spec.ts
    meal-flow.spec.ts
    menu-flow.spec.ts
```

---

## Risks and Mitigations

1. **API route auth gap** (discovered during exploration): API routes call `auth()` (server-side), but client components call `fetch()` without passing session cookies. This is a pre-existing bug. The mock authenticator will expose this issue — it should be fixed as part of the testing setup.

2. **Test flakiness:** E2E tests can be flaky. Mitigate with proper waits, retries, and stable selectors.

3. **Setup complexity:** Three testing frameworks is a lot. Mitigate by keeping each focused (Vitest for fast unit tests, Playwright for slow E2E).

4. **Mock auth in production:** The toggleable mode must never be enabled in production. Enforce with build-time checks and CI guards.
