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
  const prefilledCode = searchParams.get('code') ?? '';

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
            <Input id="name" name="name" required maxLength={100} />
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
            <Input id="inviteCode" name="inviteCode" defaultValue={prefilledCode} required maxLength={12} />
            <Button type="submit" variant="secondary">
              {t('joinButton')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
