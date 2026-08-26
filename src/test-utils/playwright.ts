import { test as base } from '@playwright/test';

export const test = base.extend({
  // Mock sign-in helper for tests
  async signInAsTestUser(page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Mock Sign In' }).click();
  },
});

export { expect } from '@playwright/test';
