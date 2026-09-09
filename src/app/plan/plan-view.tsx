'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { generateWeekAction, overrideDayAction } from './actions';

type Meal = { id: string; name: string; tags: string[] };
type DayEntry = { dateKey: string; dayName: string; mealId: string | null; mealName: string | null; tags: string[]; status: 'planned' | 'cooked' | 'skipped' };

export function PlanView({
  days,
  allMeals,
  hasMeals,
  notEnoughMeals,
  mealCount,
}: {
  days: DayEntry[];
  allMeals: Meal[];
  hasMeals: boolean;
  notEnoughMeals: boolean;
  mealCount: number;
}) {
  const t = useTranslations('Plan');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button disabled={!hasMeals} onClick={() => generateWeekAction()}>
          {t('generateWeek')}
        </Button>
      </div>

      {!hasMeals && <p className="text-sm text-muted-foreground">{t('noMealsYet')}</p>}
      {hasMeals && notEnoughMeals && (
        <p className="rounded bg-amber-100 p-2 text-sm text-amber-900">
          {t('notEnoughMealsWarning', { count: mealCount })}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <Card key={day.dateKey}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{day.dayName}</CardTitle>
              {day.status !== 'planned' && (
                <Badge variant={day.status === 'cooked' ? 'default' : 'secondary'}>
                  {day.status === 'cooked' ? t('statusCooked') : t('statusSkipped')}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {day.status === 'planned' ? (
                <Select
                  value={day.mealId ?? undefined}
                  onValueChange={(mealId) => overrideDayAction(day.dateKey, mealId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('noMealAssigned')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allMeals.map((meal) => (
                      <SelectItem key={meal.id} value={meal.id}>
                        {meal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{day.mealName ?? t('noMealAssigned')}</p>
              )}
              <div className="flex gap-1">
                {day.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
