# MenuMaker Phase 7: Household Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Household Settings screen: household name (view; rename), invite code/link with copy button, member list, remove-self/leave option, and custom tag management (add/rename/delete a tag, distinct from Phase 4's inline tag creation while adding a meal). Also add a sign-out control, since no screen has provided one until now.

**Architecture:** Server Actions in `src/app/settings/actions.ts` call new functions in `src/lib/household.ts` (rename household, leave household, list members) and `src/lib/meal.ts` (rename/delete tag — tag creation already exists from Phase 4). "Leave household" sets the caller's `householdId` to `null` and redirects to `/onboarding`; if the caller is the last member, the household (and its meals/tags/plan entries) is deleted via Prisma's cascading deletes already defined in the Phase 1 schema.

**Tech Stack:** builds on Phases 1–6. No new npm dependencies.

**Depends on:** Phase 1 (schema, cascading deletes), Phase 3 (`requireHousehold`, i18n, `DEFAULT_TAGS`/invite code), Phase 4 (tag CRUD primitives).

---

### Task 1: Household management functions (with unit + integration tests)

**Files:**
- Modify: `src/lib/household.ts`
- Test: `tests/unit/household.test.ts`, `tests/integration/household-settings.test.ts`

- [ ] **Step 1: Write the failing unit test for the rename validation**

Add to `tests/unit/household.test.ts` (appending to the existing `generateInviteCode` describe block):
```ts
import { householdNameSchema } from '@/lib/household';

describe('householdNameSchema', () => {
  it('accepts a valid name', () => {
    expect(householdNameSchema.safeParse('The Smiths').success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(householdNameSchema.safeParse('').success).toBe(false);
  });

  it('rejects a name over 100 characters', () => {
    expect(householdNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit -- tests/unit/household.test.ts`
Expected: FAIL — `householdNameSchema` is not exported.

- [ ] **Step 3: Implement the new functions in `src/lib/household.ts`**

Append to `src/lib/household.ts` (add the import at the top alongside the existing `prisma` import):
```ts
import { z } from 'zod';

export const householdNameSchema = z.string().trim().min(1).max(100);

export async function renameHousehold(householdId: string, name: string) {
  return prisma.household.update({ where: { id: householdId }, data: { name } });
}

export async function listHouseholdMembers(householdId: string) {
  return prisma.user.findMany({
    where: { householdId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Removes the user from the household. If they were the last member, the
 * household itself (and, via schema-level cascading deletes, its meals,
 * tags, and plan entries) is deleted.
 */
export async function leaveHousehold(householdId: string, userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { householdId: null } });

  const remaining = await prisma.user.count({ where: { householdId } });
  if (remaining === 0) {
    await prisma.household.delete({ where: { id: householdId } });
  }
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `npm run test:unit -- tests/unit/household.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the integration test**

`tests/integration/household-settings.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { createHouseholdWithOwner, renameHousehold, listHouseholdMembers, leaveHousehold } from '@/lib/household';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

beforeEach(async () => {
  await prisma.planEntry.deleteMany();
  await prisma.mealTag.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: '@settings-test.example.com' } } });
  await prisma.household.deleteMany({ where: { name: { contains: 'Settings Test Household' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('renameHousehold', () => {
  it('updates the household name', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner@settings-test.example.com', name: 'Owner' } });
    const household = await createHouseholdWithOwner('Settings Test Household A', owner.id);

    const updated = await renameHousehold(household.id, 'Renamed Household');

    expect(updated.name).toBe('Renamed Household');
  });
});

describe('listHouseholdMembers', () => {
  it('lists all members of the household, not other households', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner2@settings-test.example.com', name: 'Owner2' } });
    const household = await createHouseholdWithOwner('Settings Test Household B', owner.id);
    const joiner = await prisma.user.create({
      data: { email: 'joiner@settings-test.example.com', name: 'Joiner', householdId: household.id },
    });
    const otherOwner = await prisma.user.create({ data: { email: 'other@settings-test.example.com', name: 'Other' } });
    await createHouseholdWithOwner('Settings Test Household C', otherOwner.id);

    const members = await listHouseholdMembers(household.id);

    expect(members.map((m) => m.id).sort()).toEqual([owner.id, joiner.id].sort());
  });
});

describe('leaveHousehold', () => {
  it('clears the leaving user’s householdId but keeps the household when other members remain', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner3@settings-test.example.com', name: 'Owner3' } });
    const household = await createHouseholdWithOwner('Settings Test Household D', owner.id);
    const joiner = await prisma.user.create({
      data: { email: 'joiner2@settings-test.example.com', name: 'Joiner2', householdId: household.id },
    });

    await leaveHousehold(household.id, joiner.id);

    const updatedJoiner = await prisma.user.findUnique({ where: { id: joiner.id } });
    expect(updatedJoiner?.householdId).toBeNull();
    const stillExists = await prisma.household.findUnique({ where: { id: household.id } });
    expect(stillExists).not.toBeNull();
  });

  it('deletes the household when the last member leaves', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner4@settings-test.example.com', name: 'Owner4' } });
    const household = await createHouseholdWithOwner('Settings Test Household E', owner.id);

    await leaveHousehold(household.id, owner.id);

    const gone = await prisma.household.findUnique({ where: { id: household.id } });
    expect(gone).toBeNull();
  });

  it('cascades meal/tag/plan-entry deletion when the last member leaves', async () => {
    const owner = await prisma.user.create({ data: { email: 'owner5@settings-test.example.com', name: 'Owner5' } });
    const household = await createHouseholdWithOwner('Settings Test Household F', owner.id);
    const meal = await prisma.meal.create({ data: { householdId: household.id, name: 'Doomed Meal' } });

    await leaveHousehold(household.id, owner.id);

    const mealGone = await prisma.meal.findUnique({ where: { id: meal.id } });
    expect(mealGone).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add household rename/member-list/leave functions with tests"
```

---

### Task 2: Tag rename/delete functions (with unit test)

**Files:**
- Modify: `src/lib/meal.ts`
- Test: `tests/integration/meal.test.ts` (append)

- [ ] **Step 1: Write the failing integration test**

Append to `tests/integration/meal.test.ts` (inside the existing test file, add a new `describe` block, reusing the file's existing `makeHousehold` helper):
```ts
import { renameTag, deleteTag } from '@/lib/meal';

describe('renameTag and deleteTag', () => {
  it('renames a tag scoped to its household', async () => {
    const household = await makeHousehold('I');
    const tag = await createTag(household.id, 'old name');

    const renamed = await renameTag(household.id, tag!.id, 'new name');

    expect(renamed?.name).toBe('new name');
  });

  it('rejects renaming a tag from a different household', async () => {
    const householdA = await makeHousehold('J');
    const tag = await createTag(householdA.id, 'protected');
    const householdB = await makeHousehold('K');

    const result = await renameTag(householdB.id, tag!.id, 'hacked');

    expect(result).toBeNull();
  });

  it('deletes a tag and its meal associations', async () => {
    const household = await makeHousehold('L');
    const owner = (await prisma.user.findFirst({ where: { householdId: household.id } }))!;
    const tag = await createTag(household.id, 'deletable');
    await createMeal(household.id, owner.id, { name: 'Tagged Meal', note: '', tagIds: [tag!.id] });

    const result = await deleteTag(household.id, tag!.id);

    expect(result).toBe(true);
    const remaining = await prisma.tag.findUnique({ where: { id: tag!.id } });
    expect(remaining).toBeNull();
  });

  it('rejects deleting a tag from a different household', async () => {
    const householdA = await makeHousehold('M');
    const tag = await createTag(householdA.id, 'protected2');
    const householdB = await makeHousehold('N');

    const result = await deleteTag(householdB.id, tag!.id);

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:integration`
Expected: FAIL — `renameTag`/`deleteTag` are not exported.

- [ ] **Step 3: Implement the functions**

Append to `src/lib/meal.ts`:
```ts
export async function renameTag(householdId: string, tagId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const owned = await prisma.tag.findFirst({ where: { id: tagId, householdId } });
  if (!owned) return null;

  return prisma.tag.update({ where: { id: tagId }, data: { name: trimmed } });
}

export async function deleteTag(householdId: string, tagId: string) {
  const owned = await prisma.tag.findFirst({ where: { id: tagId, householdId } });
  if (!owned) return null;

  await prisma.tag.delete({ where: { id: tagId } }); // MealTag rows cascade per Phase 1 schema
  return true;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test:integration`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add tag rename/delete functions with household-isolation tests"
```

---

### Task 3: Settings Server Actions

**Files:**
- Create: `src/app/settings/actions.ts`

- [ ] **Step 1: Implement actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHousehold } from '@/lib/session';
import { householdNameSchema, renameHousehold, leaveHousehold } from '@/lib/household';
import { createTagAction as createTagOnMeals, renameTag, deleteTag } from '@/lib/meal';

export async function renameHouseholdAction(formData: FormData) {
  const session = await requireHousehold();
  const name = householdNameSchema.parse(formData.get('name'));
  await renameHousehold(session.user.householdId!, name);
  revalidatePath('/settings');
}

export async function leaveHouseholdAction() {
  const session = await requireHousehold();
  await leaveHousehold(session.user.householdId!, session.user.id);
  redirect('/onboarding');
}

export async function createTagAction(name: string) {
  const session = await requireHousehold();
  return createTagOnMeals(session.user.householdId!, name);
}

export async function renameTagAction(tagId: string, name: string) {
  const session = await requireHousehold();
  const result = await renameTag(session.user.householdId!, tagId, name);
  if (!result) throw new Error('Tag not found or not in your household');
  revalidatePath('/settings');
  revalidatePath('/meals');
}

export async function deleteTagAction(tagId: string) {
  const session = await requireHousehold();
  const result = await deleteTag(session.user.householdId!, tagId);
  if (!result) throw new Error('Tag not found or not in your household');
  revalidatePath('/settings');
  revalidatePath('/meals');
}
```

Note: `src/lib/meal.ts`'s existing `createTag` (Phase 4) is imported and re-exported here under a distinct action name (`createTagAction`) rather than duplicating logic — Settings and the Meals form both call the same underlying function.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add Server Actions for household settings and tag management"
```

---

### Task 4: Settings page

**Files:**
- Modify: `src/app/settings/page.tsx`, `messages/en.json`, `messages/hu.json`
- Create: `src/app/settings/settings-view.tsx`

- [ ] **Step 1: Add translations**

Add to `messages/en.json`:
```json
"Settings": {
  "title": "Household Settings",
  "householdNameLabel": "Household name",
  "save": "Save",
  "inviteCodeLabel": "Invite code",
  "inviteLinkLabel": "Invite link",
  "copy": "Copy",
  "copied": "Copied!",
  "membersTitle": "Members",
  "tagsTitle": "Tags",
  "newTagPlaceholder": "New tag name",
  "addTag": "Add tag",
  "rename": "Rename",
  "delete": "Delete",
  "leaveHousehold": "Leave household",
  "leaveConfirm": "Are you sure you want to leave this household? If you're the last member, all its meals and history will be deleted.",
  "signOut": "Sign out"
}
```

Add to `messages/hu.json`:
```json
"Settings": {
  "title": "Háztartás beállításai",
  "householdNameLabel": "Háztartás neve",
  "save": "Mentés",
  "inviteCodeLabel": "Meghívókód",
  "inviteLinkLabel": "Meghívó link",
  "copy": "Másolás",
  "copied": "Másolva!",
  "membersTitle": "Tagok",
  "tagsTitle": "Címkék",
  "newTagPlaceholder": "Új címke neve",
  "addTag": "Címke hozzáadása",
  "rename": "Átnevezés",
  "delete": "Törlés",
  "leaveHousehold": "Háztartás elhagyása",
  "leaveConfirm": "Biztosan elhagyod ezt a háztartást? Ha te vagy az utolsó tag, minden étel és előzmény törlődik.",
  "signOut": "Kijelentkezés"
}
```

- [ ] **Step 2: Page (Server Component) — fetch household, members, tags**

`src/app/settings/page.tsx`:
```tsx
import { requireHousehold } from '@/lib/session';
import { listHouseholdMembers } from '@/lib/household';
import { listTags } from '@/lib/meal';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import { SettingsView } from './settings-view';

export default async function SettingsPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('Settings');

  const [household, members, tags] = await Promise.all([
    prisma.household.findUniqueOrThrow({ where: { id: householdId } }),
    listHouseholdMembers(householdId),
    listTags(householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <SettingsView
        householdName={household.name}
        inviteCode={household.inviteCode}
        currentUserId={session.user.id}
        members={members}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
      />
    </div>
  );
}
```

- [ ] **Step 3: Client view — rename form, invite code/link with copy, member list, tag management, leave, sign out**

`src/app/settings/settings-view.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  renameHouseholdAction,
  leaveHouseholdAction,
  createTagAction,
  renameTagAction,
  deleteTagAction,
} from './actions';

type Member = { id: string; name: string | null; email: string };
type Tag = { id: string; name: string };

export function SettingsView({
  householdName,
  inviteCode,
  currentUserId,
  members,
  tags,
}: {
  householdName: string;
  inviteCode: string;
  currentUserId: string;
  members: Member[];
  tags: Tag[];
}) {
  const t = useTranslations('Settings');
  const router = useRouter();
  const [tagList, setTagList] = useState(tags);
  const [newTagName, setNewTagName] = useState('');
  const [copied, setCopied] = useState(false);

  const inviteLink =
    typeof window !== 'undefined' ? `${window.location.origin}/onboarding?code=${inviteCode}` : '';

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAddTag() {
    if (!newTagName.trim()) return;
    const tag = await createTagAction(newTagName.trim());
    if (tag) setTagList((prev) => [...prev, tag]);
    setNewTagName('');
  }

  async function handleRenameTag(tagId: string) {
    const current = tagList.find((tag) => tag.id === tagId);
    const next = window.prompt(t('rename'), current?.name);
    if (!next || !next.trim()) return;
    await renameTagAction(tagId, next.trim());
    setTagList((prev) => prev.map((tag) => (tag.id === tagId ? { ...tag, name: next.trim() } : tag)));
  }

  async function handleDeleteTag(tagId: string) {
    await deleteTagAction(tagId);
    setTagList((prev) => prev.filter((tag) => tag.id !== tagId));
  }

  async function handleLeave() {
    if (!window.confirm(t('leaveConfirm'))) return;
    await leaveHouseholdAction();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('householdNameLabel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              await renameHouseholdAction(formData);
              router.refresh();
            }}
            className="flex gap-2"
          >
            <Input name="name" defaultValue={householdName} maxLength={100} required />
            <Button type="submit">{t('save')}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('inviteCodeLabel')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-mono text-lg">{inviteCode}</p>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">{t('inviteLinkLabel')}</Label>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('membersTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id} className="text-sm">
                {member.name ?? member.email}
                {member.id === currentUserId ? ' (you)' : ''}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tagsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1">
            {tagList.map((tag) => (
              <li key={tag.id} className="flex items-center justify-between text-sm">
                <span>{tag.name}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleRenameTag(tag.id)}>
                    {t('rename')}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => handleDeleteTag(tag.id)}>
                    {t('delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              placeholder={t('newTagPlaceholder')}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={handleAddTag}>
              {t('addTag')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="destructive" onClick={handleLeave}>
          {t('leaveHousehold')}
        </Button>
        <Button type="button" variant="outline" onClick={() => signOut({ callbackUrl: '/signin' })}>
          {t('signOut')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, sign in, go to `/settings`.
Expected: household name form pre-filled; renaming and saving updates it. Invite code displayed; "Copy" copies the invite link and briefly shows "Copied!". Member list shows all household members with "(you)" next to the current user. Tags section lists the 5 default tags plus any custom ones from Phase 4; add/rename/delete all work and are reflected on `/meals` after a refresh. "Sign out" returns to `/signin`. "Leave household" prompts for confirmation, then redirects to `/onboarding`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement Household Settings screen"
```

---

### Task 5: Wire the invite code from a link into the onboarding join form

**Files:**
- Modify: `src/app/onboarding/onboarding-form.tsx`

The Settings invite link built in Task 4 is `/onboarding?code=<code>`. The onboarding join form (Phase 3) should pre-fill from this query param so following the link is a one-click join instead of requiring the code to be re-typed.

- [ ] **Step 1: Read the search param and pre-fill**

In `src/app/onboarding/onboarding-form.tsx`, add `'use client'` is already present (from Phase 3); add:
```tsx
import { useSearchParams } from 'next/navigation';
```
and inside the component, before the return:
```tsx
const searchParams = useSearchParams();
const prefilledCode = searchParams.get('code') ?? '';
```
Then set the join code input's `defaultValue={prefilledCode}` on its `<Input>` element (the exact input from Phase 3's `OnboardingForm` — locate the invite-code `<Input>` and add this prop).

- [ ] **Step 2: Verify manually**

Sign in as a second dev-login user, visit `/onboarding?code=<real-invite-code>` directly.
Expected: the join form's invite code field is pre-filled; clicking "Join household" succeeds without retyping the code.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: pre-fill invite code from onboarding link query param"
```

---

## Self-Review Notes

- **Spec coverage:** Household Settings screen (spec Screens #6: "household name, invite code/link, member list (with remove-self / leave option), manage custom tags") — fully implemented: rename, invite code + copyable link, member list, leave (with cascading household deletion when the last member leaves — a reasonable extrapolation since the spec has no "delete household" screen and an empty household with data no one can see is a dead-data edge case worth closing), tag add/rename/delete.
- **Sign-out:** the spec never dedicates a screen to it, but every authenticated app needs one; added to Settings as the least surprising location, using NextAuth's client `signOut()` (Phase 2 already provides `SessionProvider`).
- **Household isolation:** every new function in `src/lib/household.ts` and `src/lib/meal.ts` (rename/delete tag) is scoped by `householdId` and verified by integration tests (Tasks 1–2).
- **Type consistency:** `Member`/`Tag` client types in `settings-view.tsx` match exactly what `src/app/settings/page.tsx` passes down from `listHouseholdMembers`/`listTags`.
- **Deferred:** production deployment documentation (final README section, environment variable reference for the Pi/openmediavault deployment) is Phase 8 — the last remaining planned phase.
