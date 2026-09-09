# MenuMaker Phase 2: Authentication (Google + Local Dev Mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Auth.js (NextAuth v4) with a Google OAuth provider and an optional local-only Credentials ("dev login") provider, backed by the Prisma adapter, protecting all app routes except the sign-in page, with a production safety guard against the mock provider ever being enabled.

**Architecture:** NextAuth v4 configured in `src/lib/auth.ts`, exposed via the App Router catch-all route handler `src/app/api/auth/[...nextauth]/route.ts`. Database session strategy via `@auth/prisma-adapter` (persists `User`/`Account`/`Session` in Postgres). Global middleware (`src/middleware.ts`) protects all routes except `/api/auth/*` and `/signin`. A `SessionProvider` client wrapper makes `useSession` available. `ENABLE_MOCK_AUTH=true` + `NODE_ENV=production` throws at startup (via a check inside `src/lib/auth.ts`, which is imported eagerly by the route handler and middleware).

**Tech Stack:** next-auth 4.24.15, @auth/prisma-adapter 2.11.3 (peer-compatible with next-auth v4 and @prisma/client 6.x), Prisma (from Phase 1).

**Depends on:** Phase 1 (project scaffold, Prisma schema, `src/lib/prisma.ts`).

---

### Task 1: Extend the Prisma schema with Auth.js tables

**Files:**
- Modify: `prisma/schema.prisma`

Auth.js's Prisma adapter needs `Account` and `Session` models in addition to `User`. The existing `User` model (from Phase 1) already has `id`, `email`, `name` — we extend it with the fields the adapter expects (`emailVerified`, `image`) and relations, keeping the MenuMaker-specific fields (`googleId`, `locale`, `householdId`) as-is. `googleId` becomes redundant once `Account` exists (the adapter tracks provider account IDs there), but the spec explicitly lists it in the data model, so it is kept as a denormalized convenience field populated in the `signIn` callback.

- [ ] **Step 1: Add `Account`, `Session`, `VerificationToken` models and extend `User`**

In `prisma/schema.prisma`, replace the `User` model and add the three adapter models:

```prisma
model User {
  id            String      @id @default(cuid())
  googleId      String?     @unique
  email         String      @unique
  emailVerified DateTime?
  name          String?
  image         String?
  locale        String      @default("en")
  householdId   String?
  household     Household?  @relation(fields: [householdId], references: [id])
  createdMeals  Meal[]      @relation("MealCreatedBy")
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime    @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name add_auth_tables`
Expected: migration created and applied; Prisma Client regenerated.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: extend Prisma schema with Auth.js Account/Session/VerificationToken tables"
```

---

### Task 2: Install Auth.js and the Prisma adapter

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

Run: `npm install next-auth@4.24.15 @auth/prisma-adapter@2.11.3`

- [ ] **Step 2: Generate a secret for local dev**

Run: `npx auth secret` (writes `AUTH_SECRET` to `.env.local`) — or manually:
```bash
openssl rand -base64 32
```
Copy the output into `.env.local` as `NEXTAUTH_SECRET=<value>`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add next-auth and Prisma adapter dependencies"
```

---

### Task 3: Write the failing auth-guard unit test first

**Files:**
- Test: `tests/unit/auth-config.test.ts`

This test exercises the safety guard described in the spec: the app must throw a startup error if `ENABLE_MOCK_AUTH=true` while `NODE_ENV=production`. We extract that check into a small, independently-testable function.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { assertMockAuthSafe } from '@/lib/auth-guard';

describe('assertMockAuthSafe', () => {
  it('throws when mock auth is enabled in production', () => {
    expect(() => assertMockAuthSafe({ enableMockAuth: true, nodeEnv: 'production' })).toThrow(
      /ENABLE_MOCK_AUTH/,
    );
  });

  it('does not throw when mock auth is enabled in development', () => {
    expect(() => assertMockAuthSafe({ enableMockAuth: true, nodeEnv: 'development' })).not.toThrow();
  });

  it('does not throw when mock auth is disabled in production', () => {
    expect(() => assertMockAuthSafe({ enableMockAuth: false, nodeEnv: 'production' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit -- tests/unit/auth-config.test.ts`
Expected: FAIL — `Cannot find module '@/lib/auth-guard'`.

- [ ] **Step 3: Implement the guard**

Create `src/lib/auth-guard.ts`:
```ts
export function assertMockAuthSafe(env: { enableMockAuth: boolean; nodeEnv: string | undefined }) {
  if (env.enableMockAuth && env.nodeEnv === 'production') {
    throw new Error(
      'ENABLE_MOCK_AUTH must not be set to true when NODE_ENV=production. ' +
        'Remove ENABLE_MOCK_AUTH from the production environment.',
    );
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:unit -- tests/unit/auth-config.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ENABLE_MOCK_AUTH production safety guard with tests"
```

---

### Task 4: Configure Auth.js (Google + conditional Credentials provider)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`

- [ ] **Step 1: Write `src/lib/auth.ts`**

```ts
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { assertMockAuthSafe } from '@/lib/auth-guard';

assertMockAuthSafe({
  enableMockAuth: process.env.ENABLE_MOCK_AUTH === 'true',
  nodeEnv: process.env.NODE_ENV,
});

const providers: NextAuthOptions['providers'] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  }),
];

if (process.env.ENABLE_MOCK_AUTH === 'true') {
  providers.push(
    CredentialsProvider({
      id: 'dev-login',
      name: 'Dev Login',
      credentials: {
        name: { label: 'Name', type: 'text' },
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const user = await prisma.user.upsert({
          where: { email: credentials.email },
          update: { name: credentials.name || undefined },
          create: {
            email: credentials.email,
            name: credentials.name || credentials.email,
          },
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    // Credentials provider requires JWT sessions; using jwt for both
    // providers keeps behavior consistent regardless of which one signed in.
    strategy: 'jwt',
  },
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && account.providerAccountId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleId: account.providerAccountId },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        const dbUser = await prisma.user.findUnique({ where: { id: token.sub } });
        if (dbUser) {
          session.user.householdId = dbUser.householdId;
          session.user.locale = dbUser.locale;
        }
      }
      return session;
    },
  },
};
```

Note on session strategy: the spec doesn't mandate JWT vs database sessions. Credentials providers in NextAuth v4 only support JWT sessions (see Auth.js docs), so JWT is used uniformly. The Prisma adapter is still used for `Account` persistence (Google) and the `User` table — only the `Session` table goes unused with this strategy, which is fine at this scale (a "concurrent edits: last-write-wins" scale app, per spec).

- [ ] **Step 2: Route handler**

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 3: Extend the session/user types**

`src/types/next-auth.d.ts`:
```ts
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      householdId: string | null;
      locale: string;
    };
  }
}
```

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: success. (The Google provider will be configured with empty strings if `.env.local` has no real credentials — that's fine for a build-time check; runtime sign-in via Google requires real credentials, which is exercised manually, not in automated tests.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: configure Auth.js with Google and conditional dev-login providers"
```

---

### Task 5: Session provider wrapper and sign-in page

**Files:**
- Create: `src/components/providers.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/signin/page.tsx`

- [ ] **Step 1: Client-side SessionProvider wrapper**

`src/components/providers.tsx`:
```tsx
'use client';

import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 2: Wrap the root layout**

Modify `src/app/layout.tsx` to wrap `{children}` (and `<Nav />`) with `<Providers>`:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/nav';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MenuMaker',
  description: 'Plan your family dinner menu',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <Nav />
          <main className="p-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Sign-in page with Google button and conditional dev-login form**

`src/app/signin/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignInPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const mockAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true';

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <h1 className="text-2xl font-bold">Sign in to MenuMaker</h1>

      <Button onClick={() => signIn('google', { callbackUrl: '/plan' })}>
        Sign in with Google
      </Button>

      {mockAuthEnabled && (
        <form
          className="flex flex-col gap-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            signIn('dev-login', { name, email, callbackUrl: '/plan' });
          }}
        >
          <p className="text-sm text-muted-foreground">Dev login (local only)</p>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" variant="secondary">
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}
```

Since `ENABLE_MOCK_AUTH` is a server-only env var, expose a public mirror for the client-side conditional render:

- [ ] **Step 4: Expose a public flag for the client**

In `.env.example` and `.env.local`, add:
```
NEXT_PUBLIC_ENABLE_MOCK_AUTH=true
```
(mirrors `ENABLE_MOCK_AUTH` — Next.js only inlines vars prefixed `NEXT_PUBLIC_` into client bundles). Document in a comment in `.env.example` that both must be kept in sync locally, and that `NEXT_PUBLIC_ENABLE_MOCK_AUTH` must never be set in production either.

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, visit `http://localhost:3000/signin`.
Expected: page renders a Google button and (with `.env.local` having both mock-auth flags set) a dev-login form. Submitting name+email signs in and redirects to `/plan`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add sign-in page with Google and dev-login options"
```

---

### Task 6: Protect routes with middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write middleware that requires a session for all routes except auth and signin**

```ts
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/signin',
  },
});

export const config = {
  matcher: ['/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Verify unauthenticated access redirects to sign-in**

Run: `npm run dev`, then in a fresh browser session (or incognito) visit `http://localhost:3000/plan`.
Expected: redirected to `/signin`.

- [ ] **Step 3: Verify authenticated access works**

Sign in via the dev-login form, then visit `/plan`, `/meals`, `/history`, `/settings`.
Expected: all render without redirect.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: protect app routes with Auth.js middleware"
```

---

### Task 7: Integration test — dev-login creates and reuses a User row

**Files:**
- Create: `tests/integration/dev-login.test.ts`
- Create: `vitest.integration.config.ts`
- Modify: `package.json` (scripts)

This is the first integration test in the project; it exercises the `authorize()` logic (extracted for testability) against a real test Postgres instance, per the spec's testing strategy ("Integration tests: API routes exercised against a test PostgreSQL instance (Docker), via Prisma").

- [ ] **Step 1: Extract the dev-login upsert into a testable function**

Modify `src/lib/auth.ts`: move the upsert logic out of the inline `authorize` callback into an exported function, then call it from `authorize`.

```ts
export async function upsertDevUser(input: { email: string; name?: string | null }) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: { name: input.name || undefined },
    create: {
      email: input.email,
      name: input.name || input.email,
    },
  });
}
```

Update the `authorize` callback body to:
```ts
async authorize(credentials) {
  if (!credentials?.email) return null;
  const user = await upsertDevUser({ email: credentials.email, name: credentials.name });
  return { id: user.id, email: user.email, name: user.name };
},
```

- [ ] **Step 2: Add an integration Vitest config pointing at the test database**

`vitest.integration.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
  },
});
```

- [ ] **Step 3: Add setup that points Prisma at the test DB**

`tests/integration/setup.ts`:
```ts
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://test:test@localhost:5433/menumaker_test?schema=public';
```

- [ ] **Step 4: Write the failing test**

`tests/integration/dev-login.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { upsertDevUser } from '@/lib/auth';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'dev-test@example.com' } });
  await prisma.$disconnect();
});

describe('upsertDevUser', () => {
  it('creates a new user on first call', async () => {
    const user = await upsertDevUser({ email: 'dev-test@example.com', name: 'Dev Tester' });
    expect(user.email).toBe('dev-test@example.com');
    expect(user.name).toBe('Dev Tester');
  });

  it('reuses the same user row on a second call with the same email', async () => {
    const first = await upsertDevUser({ email: 'dev-test@example.com', name: 'Dev Tester' });
    const second = await upsertDevUser({ email: 'dev-test@example.com', name: 'Dev Tester Updated' });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Dev Tester Updated');
  });
});
```

- [ ] **Step 5: Add the npm script**

In `package.json`:
```json
"test:integration": "docker compose -f docker-compose.test.yml up -d && sleep 2 && vitest run --config vitest.integration.config.ts; docker compose -f docker-compose.test.yml down"
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: test database container starts, migrations apply, both tests PASS, container is torn down.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add integration test for dev-login user upsert"
```

---

## Self-Review Notes

- **Spec coverage:** Google OAuth provider (always available), Credentials "dev login" provider (only when `ENABLE_MOCK_AUTH=true`), same session mechanism for both (JWT), production safety guard (throws on `ENABLE_MOCK_AUTH=true` + `NODE_ENV=production`), `.env.example` sets `ENABLE_MOCK_AUTH=true`, `docker-compose.yml` (from Phase 1) does not set it. All covered.
- **No password storage**: confirmed — Credentials provider here never persists or checks a password field; it only upserts by email for local dev convenience.
- **Deferred:** Onboarding (household creation/join) is Phase 3 — until then, `session.user.householdId` is `null` for all users and later phases must handle that.
