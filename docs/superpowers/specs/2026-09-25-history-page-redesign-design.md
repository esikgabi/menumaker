# History Page Redesign — Design

## Overview

The History page (`src/app/history/page.tsx`) currently renders each cooked
`PlanEntry` as a flat row (date — meal name — tags), one per row, inside a
week `Card`. This has two problems visible in production data:

1. **No category visibility.** A day with both a cooked soup and a cooked
   main renders as two rows that look identical to two unrelated days —
   nothing shows which slot (`main`/`soup`) a row belongs to.
2. **No day grouping.** Same-day main+soup rows aren't visually connected;
   they just happen to be adjacent (or aren't, if a same-day skip pushes them
   apart), so a day's full history isn't a single scannable unit.

This spec regroups entries by day within each week, and adds an explicit
category label per row, reusing the app's existing muted-gray category-label
style from `/plan` (no new colors, no new visual language).

## Scope

- Regroup `listCookedHistory`'s per-week `entries` array into per-day groups
  (Soup row before Main row when both exist), inside the existing week
  `Card`.
- Add a muted-gray uppercase category label ("Soup"/"Main") per row, matching
  `/plan`'s `renderSlot` label styling exactly (`text-xs font-semibold
  uppercase text-muted-foreground`) — no color-coding.
- Day header shows weekday name + date (e.g. "Saturday, 2026-09-19"), reusing
  the existing `Plan.monday`..`Plan.sunday` translation keys already in both
  locale files — no new i18n keys, no `Intl.DateTimeFormat`/`next-intl`
  formatter dependency.
- If a day only has one category cooked, the other category's row is simply
  omitted (no placeholder "—" row).
- Tags stay inline next to the meal name (`flex flex-wrap`), same as today —
  on narrow viewports they wrap naturally under the text.

## Out of Scope

- Changing what counts as "history" (still only `status: 'cooked'`, meal
  non-null) — no change to the skip/skipped-entries behavior.
- The week-level `Card` / `"Week of ..."` grouping — stays exactly as is.
- Any new dependency (date formatting library, color tokens) — day names
  reuse existing `Plan` translations; category labels reuse existing
  `/plan` Tailwind classes.
- Pagination / infinite scroll / date filtering on the history list — not
  requested, existing full-list rendering is unchanged.

## Changes

### `src/lib/plan.ts`

`listCookedHistory` currently returns `{ weekStartKey, entries }[]` where
`entries` is a flat, date-desc list. Add a day-grouping step so the page
doesn't need to re-derive it:

```ts
/** Returns cooked PlanEntry rows for a household, grouped by Monday-start week
 *  (most recent week first) and then by day within the week (most recent day
 *  first, soup before main within a day). */
export async function listCookedHistory(householdId: string) {
  const entries = (
    await prisma.planEntry.findMany({
      where: { householdId, status: 'cooked' },
      include: { meal: { include: { tags: { include: { tag: true } } } } },
      orderBy: { date: 'desc' },
    })
  ).filter((e) => e.meal !== null);

  const weekMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const weekStartKey = getWeekDateKeys(entry.date)[0];
    const existing = weekMap.get(weekStartKey);
    if (existing) existing.push(entry);
    else weekMap.set(weekStartKey, [entry]);
  }

  return [...weekMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStartKey, weekEntries]) => ({
      weekStartKey,
      days: groupByDay(weekEntries),
    }));
}

const CATEGORY_ORDER = { soup: 0, main: 1 } as const;

function groupByDay<T extends { date: Date; category: 'main' | 'soup' }>(entries: T[]) {
  const dayMap = new Map<string, T[]>();
  for (const entry of entries) {
    const key = toDateKey(entry.date);
    const existing = dayMap.get(key);
    if (existing) existing.push(entry);
    else dayMap.set(key, [entry]);
  }

  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // most recent day first
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      entries: [...dayEntries].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]),
    }));
}
```

Return shape becomes `{ weekStartKey, days: { dateKey, entries }[] }[]` —
`entries` keeps its current per-row shape (`id`, `date`, `category`, `meal`
with `tags`), just regrouped. This is a pure in-memory regrouping of the
already-fetched rows — no new query, no schema change.

### `src/app/history/page.tsx`

Restructure the render to walk `week.days` instead of `week.entries`, and add
the day header + per-row category label:

```tsx
import { requireHousehold } from '@/lib/session';
import { listCookedHistory, transitionPastPlannedEntries } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export default async function HistoryPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('History');
  const tPlan = await getTranslations('Plan');

  await transitionPastPlannedEntries(householdId);
  const weeks = await listCookedHistory(householdId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {weeks.length === 0 && <p className="text-sm text-muted-foreground">{t('noHistory')}</p>}

      {weeks.map((week) => (
        <Card key={week.weekStartKey}>
          <CardHeader>
            <CardTitle className="text-base">{t('weekOf', { date: week.weekStartKey })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {week.days.map((day) => {
              const dayIndex = (new Date(day.dateKey).getDay() + 6) % 7; // Mon=0..Sun=6
              return (
                <div key={day.dateKey} className="flex flex-col gap-1.5 border-b pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-semibold">
                    {tPlan(DAY_NAME_KEYS[dayIndex])}, {day.dateKey}
                  </span>
                  {day.entries.map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-11 shrink-0 text-xs font-semibold uppercase text-muted-foreground">
                        {entry.category === 'soup' ? tPlan('soupLabel') : tPlan('mainLabel')}
                      </span>
                      <span className="text-sm">{entry.meal?.name}</span>
                      {entry.meal?.tags.map((mealTag) => (
                        <Badge key={mealTag.tag.id} variant="outline">
                          {mealTag.tag.name}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

Notes:
- Reuses `Plan.soupLabel`/`Plan.mainLabel`/day-name keys instead of adding new
  `History` i18n keys — same words, one less place to keep translations in
  sync. `getTranslations('Plan')` is called once at the top alongside the
  existing `getTranslations('History')` call.
- `dayIndex` computed the same way `getWeekDateKeys` already does
  (`(getDay() + 6) % 7`), consistent with the rest of `plan.ts`.
- Card/Badge imports and week-level structure unchanged.

### i18n

No new keys. No changes to `messages/en.json` / `messages/hu.json`.

## Tests

### `tests/integration/plan-history.test.ts`

Update assertions for the new `days` shape and add one grouping-specific
case:

- Existing "grouping/ordering" test: change `weeks[0].entries` →
  `weeks[0].days[0].entries` (single day, one entry).
- Existing "main and soup same day" test: assert
  `weeks[0].days` has length 1 (one day), and
  `weeks[0].days[0].entries.map(e => e.category)` equals `['soup', 'main']`
  (soup-first ordering), not just an unordered pair.
- Existing "deleted meal" and "household isolation" tests: change
  `weeks` length/emptiness assertions to check `weeks` array itself (unchanged
  — these don't touch `entries`/`days`).
- New case: two different days in the same week, each with one cooked main —
  assert `weeks[0].days` has length 2, ordered most-recent-day-first.

No `tests/unit` changes needed — `groupByDay` is a small private helper
exercised indirectly through the existing/updated integration tests; it's not
exported, so no direct unit test (consistent with `listCookedHistory` itself
being integration-only, per `AGENTS.md`'s stated pure/DB split — this helper
is pure but trivial enough not to warrant peeling out and separately testing,
per YAGNI).

### `tests/e2e`

No existing e2e spec targets `/history` row structure (grep confirmed no
`history` references outside the integration test) — no e2e changes.

## Migration Notes

- No Prisma schema/migration change.
- No data migration — pure query-result regrouping + presentational change.
- `listCookedHistory`'s return shape changes (`entries` → `days[].entries`)
  — the only caller is `src/app/history/page.tsx`, updated in this same
  change; no other consumer exists (grep confirmed).
