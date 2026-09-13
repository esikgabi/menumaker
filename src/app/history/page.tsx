import { requireHousehold } from '@/lib/session';
import { listCookedHistory, transitionPastPlannedEntries } from '@/lib/plan';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function HistoryPage() {
  const session = await requireHousehold();
  const householdId = session.user.householdId!;
  const t = await getTranslations('History');

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
          <CardContent className="flex flex-col gap-2">
            {week.entries.map((entry: (typeof weeks)[number]['entries'][number]) => (
              <div key={entry.id} className="flex items-center justify-between border-b pb-1 last:border-0">
                <span className="text-sm text-muted-foreground">{entry.date.toISOString().slice(0, 10)}</span>
                <span className="font-medium">{entry.meal?.name}</span>
                <div className="flex gap-1">
                  {entry.meal?.tags.map((mealTag: NonNullable<typeof entry.meal>['tags'][number]) => (
                    <Badge key={mealTag.tag.id} variant="outline">
                      {mealTag.tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
