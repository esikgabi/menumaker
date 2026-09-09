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
