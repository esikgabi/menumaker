# MenuMaker Design

## Overview

MenuMaker helps a family plan next week's dinner menu, answering "What should I cook?" It suggests meals based on tags and cooking history, while letting users override any suggestion. Supports multiple independent households (multi-tenant), Google-only authentication, and English/Hungarian localization. Runs as Docker containers on a Raspberry Pi 5 (16GB RAM) via openmediavault.

## Scope (v1)

- Multi-household support (each household's data is isolated)
- Household created by first sign-in, others join via invite code/link
- Equal permissions for all household members (no admin role)
- Meals: name + tags + optional short note (no ingredients/recipes/photos)
- Tags: 5 default tags seeded per household (child favourite, absolute favourite, parent favourite, healthy, fast to make) + household-specific custom tags
- One meal slot per day (dinner), week runs Monday–Sunday
- Weekly plan: auto-suggested, fully overridable per day
- Cooking history: automatically derived when a planned day passes (no manual "mark as cooked" step)
- No notifications, reminders, or emails in v1
- No native app — responsive web app only

## Out of Scope (v1)

- Multiple meal slots per day (breakfast/lunch)
- Full recipes (ingredients, steps, prep time, photos)
- Admin/member role distinction within a household
- Push notifications / email reminders
- Manual cooked-history entry independent of the plan

## Architecture

- **Framework**: Next.js 14+ (App Router), TypeScript. Combines frontend (React Server Components) and backend (API routes) in one app — no separate backend service.
- **UI Components**: shadcn/ui (Radix + Tailwind CSS) for accessible, mobile-responsive components without custom UI design work.
- **ORM / DB**: Prisma ORM against PostgreSQL.
- **Auth**: Auth.js (NextAuth) with Google OAuth provider only. No password storage anywhere, satisfying the "no password storing" requirement directly.
- **i18n**: `next-intl` for English and Hungarian, with a language switcher; default to browser locale.
- **Deployment**: `docker-compose.yml` with two services:
  - `app` — the Next.js application
  - `postgres` — PostgreSQL with a named volume for data persistence
  - Designed to be deployable via openmediavault's Docker/Compose UI on the Pi.

## Data Model

- **Household**: `id`, `name`, `inviteCode`
- **User**: `id`, `googleId`, `email`, `name`, `locale`, `householdId`
- **Meal**: `id`, `householdId`, `name`, `note` (optional), `createdBy`
- **Tag**: `id`, `householdId`, `name` — 5 default tags seeded automatically when a household is created; households may add their own custom tags
- **MealTag**: join table (`mealId`, `tagId`) — many-to-many between Meal and Tag
- **PlanEntry**: `id`, `householdId`, `date`, `mealId` (nullable until assigned), `status` (`planned` | `cooked` | `skipped`)

Cooking history is not a separate table — it's derived from `PlanEntry` rows where `status = 'cooked'`. A `planned` entry automatically becomes `cooked` once its date has passed (checked on relevant page loads; no cron job needed at this scale).

## Weekly Plan Generation (Suggestion Algorithm)

For each day of the week being generated, pick a meal weighted by:

1. **Recency avoidance**: deprioritize meals cooked within the last N weeks (default N=3, per household, no UI setting in v1).
2. **Tag balance**: try to ensure at least one "healthy" and one "fast to make" meal appear during the week, if such meals exist.
3. **No repeats within the week** where possible; if the household has fewer distinct meals than days in the week, repeats are allowed and the UI shows a warning (e.g., "only 4 meals available for 7 days").

Every day's suggestion can be overridden via a dropdown of all household meals, regardless of how it was generated.

## Screens

1. **Sign in** — Google OAuth button, EN/HU toggle.
2. **Onboarding** — shown after first sign-in with no household: "Create a household" or "Join with invite code/link".
3. **Weekly Plan (home)** — Mon–Sun view, each day shows assigned meal + tags; "Generate week" button; per-day swap dropdown; mobile-friendly stacked-card layout.
4. **Meals list** — all household meals with their tags; add/edit/delete meal; filter by tag.
5. **History** — read-only view of past weeks' `PlanEntry` records with `status = 'cooked'`.
6. **Household settings** — household name, invite code/link, member list (with remove-self / leave option), manage custom tags.

## Error Handling & Edge Cases

- **No meals yet**: "Generate week" is disabled with a message prompting the user to add meals first.
- **Not enough meals to avoid repeats**: allow repeats; show a warning banner.
- **Invalid/expired invite code**: clear error message; option to request a new invite code from a household member.
- **Auth failure**: standard Auth.js error page with retry.
- **Concurrent edits**: last-write-wins; no conflict resolution needed at this scale (small household, low concurrent-edit likelihood).

## Testing Strategy

- **Unit tests (Vitest)**: suggestion algorithm logic, meal/tag CRUD validation.
- **Integration tests**: API routes exercised against a test PostgreSQL instance (Docker), via Prisma.
- **E2E (Playwright)**: one happy-path test — sign in (mocked), create household, add a meal, generate a week, verify a plan entry auto-transitions to cooked after its date passes.
- UI components from shadcn/ui are not individually unit-tested; effort is focused on business logic (suggestion algorithm, data isolation between households, auth flow).

## Open Questions / Future Ideas (not v1)

- Configurable "avoid repeat" window (currently fixed at 3 weeks)
- Admin role for household management
- Recipe details (ingredients, steps, photos)
- Multiple meal slots per day
- Reminders/notifications
