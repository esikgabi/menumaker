import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { upsertDevUser } from '@/lib/auth';

beforeAll(() => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'inherit' });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'dev-test@example.com' } });
  await prisma.$disconnect();
});

describe('upsertDevUser', () => {
  it('creates a new user on first call', async () => {
    const user = await upsertDevUser({ email: 'dev-test@example.com', name: 'Dev Tester' });
    expect(user.email).toBe('dev-test@example.com');
    expect(user.name).toBe('Dev Tester');
  });

  it('reuses the same user row on a second call with the same email', async () => {
    const first = await upsertDevUser({ email: 'dev-test@example.com', name: 'Dev Tester' });
    const second = await upsertDevUser({ email: 'dev-test@example.com', name: 'Dev Tester Updated' });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Dev Tester Updated');
  });
});
