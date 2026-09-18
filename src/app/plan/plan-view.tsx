'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
type SlotEntry = { mealId: string | null; mealName: string | null; tags: string[]; status: 'planned' | 'cooked' | 'skipped' };
type DayEntry = { dateKey: string; dayName: string; main: SlotEntry; soup: SlotEntry };

const NONE_VALUE = '__none__';

export function PlanView({
  days,
  mainMeals,
  soupMeals,
  hasMeals,
  notEnoughMeals,
  dayCount,
  mealCount,
}: {
  days: DayEntry[];
  mainMeals: Meal[];
  soupMeals: Meal[];
  hasMeals: boolean;
  notEnoughMeals: boolean;
  dayCount: number;
  mealCount: number;
}) {
  const t = useTranslations('Plan');
  const router = useRouter();
  const [isGenerating, startGenerating] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function handleOverride(dateKey: string, category: 'main' | 'soup', mealId: string | null) {
    const key = `${dateKey}:${category}`;
    setErrorKey(null);
    try {
      await overrideDayAction(dateKey, category, mealId);
      router.refresh();
    } catch {
      setErrorKey(key);
      router.refresh();
    }
  }

  function renderSlot(dateKey: string, category: 'main' | 'soup', slot: SlotEntry, options: Meal[]) {
    const key = `${dateKey}:${category}`;
    const label = category === 'main' ? t('mainLabel') : t('soupLabel');
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
          {slot.status !== 'planned' && (
            <Badge variant={slot.status === 'cooked' ? 'default' : 'secondary'}>
              {slot.status === 'cooked' ? t('statusCooked') : t('statusSkipped')}
            </Badge>
          )}
        </div>
        {slot.status === 'planned' ? (
          <Select
            value={slot.mealId ?? (category === 'soup' ? NONE_VALUE : undefined)}
            onValueChange={(value) =>
              handleOverride(dateKey, category, value === NONE_VALUE ? null : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('noMealAssigned')} />
            </SelectTrigger>
            <SelectContent>
              {category === 'soup' && <SelectItem value={NONE_VALUE}>{t('noneOption')}</SelectItem>}
              {options.map((meal) => (
                <SelectItem key={meal.id} value={meal.id}>
                  {meal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="font-medium">{slot.mealName ?? t('noMealAssigned')}</p>
        )}
        {errorKey === key && <p className="text-sm text-destructive">{t('overrideError')}</p>}
        <div className="flex gap-1">
          {slot.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button
          disabled={!hasMeals || isGenerating}
          onClick={() => startGenerating(async () => { await generateWeekAction(); router.refresh(); })}
        >
          {isGenerating ? t('generatingWeek') : t('generateWeek')}
        </Button>
      </div>

      {!hasMeals && <p className="text-sm text-muted-foreground">{t('noMealsYet')}</p>}
      {hasMeals && notEnoughMeals && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t('notEnoughMealsWarning', { count: mealCount, days: dayCount })}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <Card key={day.dateKey}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{day.dayName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {renderSlot(day.dateKey, 'main', day.main, mainMeals)}
              {renderSlot(day.dateKey, 'soup', day.soup, soupMeals)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
