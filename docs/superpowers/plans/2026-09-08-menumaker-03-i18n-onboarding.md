# MenuMaker Phase 3: Internationalization & Household Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English/Hungarian translations with a language switcher (defaulting to browser locale, persisted per-user once signed in), and the onboarding flow that lets a newly signed-in user with no household either create one (seeding the 5 default tags) or join an existing one via invite code.

**Architecture:** `next-intl` without path-based locale routing — locale is resolved server-side from (in priority order) the signed-in user's saved `locale`, then a `NEXT_LOCALE` cookie, then the browser's `Accept-Language` header, defaulting to English. A `LocaleSwitcher` client component writes the cookie and (if signed in) the user's `locale` column via a Server Action, then triggers a router refresh. Household creation/joining is implemented as pure, testable functions in `src/lib/household.ts`, invoked from Server Actions on the `/onboarding` page. A new `requireHousehold()` helper guards the existing stub pages so they redirect to `/onboarding` until the user belongs to a household.

**Tech Stack:** next-intl 3.26.5 (compatible with Next.js 14 / React 18), building on Phases 1–2 (Next.js, Prisma, Auth.js).

**Depends on:** Phase 1 (scaffold, Prisma schema, stub pages), Phase 2 (Auth.js, `session.user.id` / `.locale` / `.householdId`).

---

### Task 1: Install and wire up next-intl (cookie/header-based, no locale routing)

**Files:**
- Create: `src/i18n/config.ts`, `src/i18n/request.ts`, `messages/en.json`, `messages/hu.json`
- Modify: `next.config.mjs`, `src/app/layout.tsx`

- [ ] **Step 1: Install next-intl**

Run: `npm install next-intl@3.26.5`

- [ ] **Step 2: Define supported locales**

`src/i18n/config.ts`:
```ts
export const SUPPORTED_LOCALES = ['en', 'hu'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
```

- [ ] **Step 3: Seed message files with the namespaces used in this phase**

`messages/en.json`:
```json
{
  "Nav": {
    "plan": "Weekly Plan",
    "meals": "Meals",
    "history": "History",
    "settings": "Settings"
  },
  "SignIn": {
    "title": "Sign in to MenuMaker",
    "googleButton": "Sign in with Google",
    "devLoginLabel": "Dev login (local only)",
    "nameLabel": "Name",
    "emailLabel": "Email",
    "continueButton": "Continue"
  },
  "Onboarding": {
    "title": "Welcome to MenuMaker",
    "createTitle": "Create a household",
    "createNameLabel": "Household name",
    "createButton": "Create household",
    "joinTitle": "Join with invite code",
    "joinCodeLabel": "Invite code",
    "joinButton": "Join household",
    "invalidCode": "That invite code is invalid or expired. Ask a household member for a new one."
  }
}
```

`messages/hu.json`:
```json
{
  "Nav": {
    "plan": "Heti menü",
    "meals": "Ételek",
    "history": "Előzmények",
    "settings": "Háztartás beállításai"
  },
  "SignIn": {
    "title": "Bejelentkezés a MenuMakerbe",
    "googleButton": "Bejelentkezés Google-fiókkal",
    "devLoginLabel": "Fejlesztői bejelentkezés (csak helyi használatra)",
    "nameLabel": "Név",
    "emailLabel": "E-mail",
    "continueButton": "Tovább"
  },
  "Onboarding": {
    "title": "Üdvözlünk a MenuMakerben",
    "createTitle": "Háztartás létrehozása",
    "createNameLabel": "Háztartás neve",
    "createButton": "Háztartás létrehozása",
    "joinTitle": "Csatlakozás meghívókóddal",
    "joinCodeLabel": "Meghívókód",
    "joinButton": "Csatlakozás a háztartáshoz",
    "invalidCode": "Ez a meghívókód érvénytelen vagy lejárt. Kérj újat egy háztartástagtól."
  }
}
```

- [ ] **Step 4: Request config — resolve locale from user → cookie → browser header → default**

`src/i18n/request.ts`:
```ts
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from './config';

export default getRequestConfig(async () => {
  const session = await getServerSession(authOptions);
  let locale = session?.user?.locale as Locale | undefined;

  if (!locale) {
    const cookieLocale = cookies().get('NEXT_LOCALE')?.value;
    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
      locale = cookieLocale as Locale;
    }
  }

  if (!locale) {
    const acceptLanguage = headers().get('accept-language') ?? '';
    const preferred = acceptLanguage.split(',')[0]?.split('-')[0];
    locale = SUPPORTED_LOCALES.includes(preferred as Locale) ? (preferred as Locale) : DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 5: Wire the Next.js plugin**

Modify `next.config.mjs`:
```js
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 6: Provide locale/messages to the client tree in the root layout**

Modify `src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Nav } from '@/components/nav';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MenuMaker',
  description: 'Plan your family dinner menu',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <Nav />
            <main className="p-4">{children}</main>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add next-intl with cookie/header-based locale resolution"
```

---

### Task 2: Locale switcher (EN/HU toggle)

**Files:**
- Create: `src/lib/locale.ts`, `src/components/locale-switcher.tsx`
- Modify: `src/components/nav.tsx`
- Create: `.env.example` addition (none needed — no new env vars)

- [ ] **Step 1: Server Action to persist locale (cookie always, DB column when signed in)**

`src/lib/locale.ts`:
```ts
'use server';

import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config';

export async function setLocale(locale: string) {
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) return;

  cookies().set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });

  const session = await getServerSession(authOptions);
  if (session?.user) {
    await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
  }
}
```

- [ ] **Step 2: Client switcher component**

`src/components/locale-switcher.tsx`:
```tsx
'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { setLocale } from '@/lib/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  return (
    <Select
      value={locale}
      onValueChange={async (value) => {
        await setLocale(value);
        router.refresh();
      }}
    >
      <SelectTrigger className="w-24">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {l.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Localize the nav and add the switcher**

Modify `src/components/nav.tsx`:
```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export async function Nav() {
  const t = await getTranslations('Nav');
  const links = [
    { href: '/plan', label: t('plan') },
    { href: '/meals', label: t('meals') },
    { href: '/history', label: t('history') },
    { href: '/settings', label: t('settings') },
  ];

  return (
    <nav className="flex items-center justify-between gap-4 border-b p-4">
      <div className="flex gap-4">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="text-sm font-medium hover:underline">
            {link.label}
          </Link>
        ))}
      </div>
      <LocaleSwitcher />
    </nav>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, sign in, switch the nav dropdown from EN to HU.
Expected: nav labels switch to Hungarian immediately (page refresh via `router.refresh()`); reloading the page keeps HU (cookie persisted); the `User.locale` column is updated (check with `npx prisma studio` or a `SELECT`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add EN/HU locale switcher persisted to cookie and user record"
```

---

### Task 3: Localize the sign-in page

**Files:**
- Modify: `src/app/signin/page.tsx`

- [ ] **Step 1: Replace hardcoded strings with translations**

```tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignInPage() {
  const t = useTranslations('SignIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const mockAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === 'true';

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Button onClick={() => signIn('google', { callbackUrl: '/' })}>{t('googleButton')}</Button>

      {mockAuthEnabled && (
        <form
          className="flex flex-col gap-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            signIn('dev-login', { name, email, callbackUrl: '/' });
          }}
        >
          <p className="text-sm text-muted-foreground">{t('devLoginLabel')}</p>
          <Label htmlFor="name">{t('nameLabel')}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" variant="secondary">
            {t('continueButton')}
          </Button>
        </form>
      )}
    </div>
  );
}
```

Note: `callbackUrl` changed from `/plan` to `/` so the home page (Task 5) can route new users to `/onboarding` and existing users to `/plan`.

- [ ] **Step 2: Verify manually**

Switch locale on the sign-in page (before signing in, the language switcher still works since it only depends on the cookie) and confirm the button/labels change language.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: localize the sign-in page"
```

---

### Task 4: Household creation/joining logic (with tests)

**Files:**
- Create: `src/lib/household.ts`
- Test: `tests/unit/household.test.ts`, `tests/integration/household.test.ts`

- [ ] **Step 1: Write the failing unit test for invite code format**

`tests/unit/household.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { generateInviteCode } from '@/lib/household';

describe('generateInviteCode', () => {
  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit -- tests/unit/household.test.ts`
Expected: FAIL — `Cannot find module '@/lib/household'`.

- [ ] **Step 3: Implement `src/lib/household.ts`**

```ts
import { prisma } from '@/lib/prisma';

export const DEFAULT_TAGS = [
  'child favourite',
  'absolute favourite',
  'parent favourite',
  'healthy',
  'fast to make',
];

export function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// ponytail: invite codes are not checked for collisions before insert (8-char
// keyspace is ~2.8e12, astronomically unlikely at this app's scale). If a
// collision ever happens, Prisma throws a unique-constraint error and the
// household is not created; add a retry loop if this is ever observed.
export async function createHouseholdWithOwner(name: string, ownerUserId: string) {
  return prisma.household.create({
    data: {
      name,
      inviteCode: generateInviteCode(),
      tags: { create: DEFAULT_TAGS.map((tagName) => ({ name: tagName })) },
      users: { connect: { id: ownerUserId } },
    },
  });
}

export async function joinHouseholdByInviteCode(inviteCode: string, userId: string) {
  const household = await prisma.household.findUnique({ where: { inviteCode } });
  if (!household) return null;

  await prisma.user.update({ where: { id: userId }, data: { householdId: household.id } });
  return household;
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `npm run test:unit -- tests/unit/household.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the integration test**

`tests/integration/household.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner, joinHouseholdByInviteCode, DEFAULT_TAGS } from '@/lib/household';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.mealTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@household-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('createHouseholdWithOwner', () => {
  it('seeds 5 default tags and assigns the owner', async () => {
    const owner = await prisma.user.create({
      data: { email: 'owner@household-test.example.com', name: 'Owner' },
    });

    const household = await createHouseholdWithOwner('Test Household A', owner.id);

    const tags = await prisma.tag.findMany({ where: { householdId: household.id } });
    expect(tags.map((t) => t.name).sort()).toEqual([...DEFAULT_TAGS].sort());

    const updatedOwner = await prisma.user.findUnique({ where: { id: owner.id } });
    expect(updatedOwner?.householdId).toBe(household.id);
  });
});

describe('joinHouseholdByInviteCode', () => {
  it('adds a user to an existing household', async () => {
    const owner = await prisma.user.create({
      data: { email: 'owner2@household-test.example.com', name: 'Owner2' },
    });
    const household = await createHouseholdWithOwner('Test Household B', owner.id);
    const joiner = await prisma.user.create({
      data: { email: 'joiner@household-test.example.com', name: 'Joiner' },
    });

    const joined = await joinHouseholdByInviteCode(household.inviteCode, joiner.id);

    expect(joined?.id).toBe(household.id);
    const updatedJoiner = await prisma.user.findUnique({ where: { id: joiner.id } });
    expect(updatedJoiner?.householdId).toBe(household.id);
  });

  it('returns null for an invalid invite code', async () => {
    const joiner = await prisma.user.create({
      data: { email: 'joiner2@household-test.example.com', name: 'Joiner2' },
    });

    const result = await joinHouseholdByInviteCode('NOPE0000', joiner.id);

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add household creation/join logic with default tag seeding"
```

---

### Task 5: Session/household guard helpers

**Files:**
- Create: `src/lib/session.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the guard helpers**

`src/lib/session.ts`:
```ts
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export async function requireHousehold() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (!session.user.householdId) redirect('/onboarding');
  return session;
}

export async function requireSessionNoHousehold() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  if (session.user.householdId) redirect('/plan');
  return session;
}
```

- [ ] **Step 2: Update the home page to route based on household presence**

`src/app/page.tsx`:
```tsx
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');
  redirect(session.user.householdId ? '/plan' : '/onboarding');
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add session/household guard helpers and home page routing"
```

---

### Task 6: Onboarding screen

**Files:**
- Create: `src/app/onboarding/page.tsx`, `src/app/onboarding/actions.ts`, `src/app/onboarding/onboarding-form.tsx`

- [ ] **Step 1: Server Actions**

`src/app/onboarding/actions.ts`:
```ts
'use server';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { createHouseholdWithOwner, joinHouseholdByInviteCode } from '@/lib/household';

export async function createHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/onboarding?error=name-required');

  await createHouseholdWithOwner(name, session.user.id);
  redirect('/plan');
}

export async function joinHouseholdAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin');

  const code = String(formData.get('inviteCode') ?? '').trim().toUpperCase();
  if (!code) redirect('/onboarding?error=code-required');

  const household = await joinHouseholdByInviteCode(code, session.user.id);
  if (!household) redirect('/onboarding?error=invalid-code');

  redirect('/plan');
}
```

- [ ] **Step 2: Client form component**

`src/app/onboarding/onboarding-form.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createHouseholdAction, joinHouseholdAction } from './actions';

export function OnboardingForm() {
  const t = useTranslations('Onboarding');
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-12">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {error === 'invalid-code' && <p className="text-sm text-destructive">{t('invalidCode')}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t('createTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createHouseholdAction} className="flex flex-col gap-3">
            <Label htmlFor="name">{t('createNameLabel')}</Label>
            <Input id="name" name="name" required />
            <Button type="submit">{t('createButton')}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('joinTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={joinHouseholdAction} className="flex flex-col gap-3">
            <Label htmlFor="inviteCode">{t('joinCodeLabel')}</Label>
            <Input id="inviteCode" name="inviteCode" required />
            <Button type="submit" variant="secondary">
              {t('joinButton')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Page**

`src/app/onboarding/page.tsx`:
```tsx
import { requireSessionNoHousehold } from '@/lib/session';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  await requireSessionNoHousehold();
  return <OnboardingForm />;
}
```

- [ ] **Step 4: Verify manually end-to-end**

Run: `npm run dev`, dev-login as a brand-new email.
Expected: redirected to `/onboarding`. Creating a household redirects to `/plan`. Signing in as a second new email, joining with the first household's invite code (visible later via Settings in Phase 7 — for now, read it from `npx prisma studio`) redirects to `/plan` and both users share the same `householdId`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add household onboarding screen (create/join)"
```

---

### Task 7: Guard the existing stub pages

**Files:**
- Modify: `src/app/plan/page.tsx`, `src/app/meals/page.tsx`, `src/app/history/page.tsx`, `src/app/settings/page.tsx`

- [ ] **Step 1: Add `requireHousehold()` to each stub page**

`src/app/plan/page.tsx`:
```tsx
import { requireHousehold } from '@/lib/session';

export default async function PlanPage() {
  await requireHousehold();
  return <h1 className="text-2xl font-bold">Weekly Plan</h1>;
}
```

Apply the identical pattern (import + `await requireHousehold();` as the first line of the component body) to `src/app/meals/page.tsx`, `src/app/history/page.tsx`, and `src/app/settings/page.tsx`, keeping each page's existing heading.

- [ ] **Step 2: Verify a user without a household is redirected**

Manually clear a test user's `householdId` via `npx prisma studio`, sign in as them, and visit `/meals` directly.
Expected: redirected to `/onboarding`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: guard protected pages behind household membership"
```

---

## Self-Review Notes

- **Spec coverage:** i18n (`next-intl`, EN/HU, language switcher, default to browser locale) — done. Onboarding screen (create household / join with invite code) — done. Default tag seeding (5 tags, exact names from spec) — done via `DEFAULT_TAGS`. Household isolation (each household's data scoped by `householdId`) — enforced at the query level in `src/lib/household.ts`; later phases (meals, plan, history, settings) must continue scoping all queries by `session.user.householdId`.
- **Edge case coverage (per spec's Error Handling section):** "Invalid/expired invite code: clear error message" — implemented via the `?error=invalid-code` redirect + translated message.
- **Type consistency:** `requireHousehold()` / `requireSessionNoHousehold()` both return the same `session` shape produced by Phase 2's `authOptions.callbacks.session`, matching `src/types/next-auth.d.ts`.
- **Deferred:** Household settings screen showing the invite code/link and member list is Phase 7. Meals/Tags CRUD is Phase 4.
