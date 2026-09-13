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
