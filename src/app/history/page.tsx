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
              const [dayYear, dayMonth, dayNum] = day.dateKey.split('-').map(Number);
              const dayIndex = (new Date(dayYear, dayMonth - 1, dayNum).getDay() + 6) % 7; // Mon=0..Sun=6
              return (
                <div key={day.dateKey} className="flex flex-col gap-1.5 border-b pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-semibold">
                    {tPlan(DAY_NAME_KEYS[dayIndex])}, {day.dateKey}
                  </span>
                  {day.entries.map((entry: (typeof week.days)[number]['entries'][number]) => (
                    <div key={entry.id} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-11 shrink-0 text-xs font-semibold uppercase text-muted-foreground">
                        {entry.category === 'soup' ? tPlan('soupLabel') : tPlan('mainLabel')}
                      </span>
                      <span className="text-sm">{entry.meal?.name}</span>
                      {entry.meal?.tags.map((mealTag: NonNullable<typeof entry.meal>['tags'][number]) => (
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
