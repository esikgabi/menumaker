import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';

test.beforeEach(async () => {
  // Clean slate for this test's known dev-login email.
  const user = await prisma.user.findUnique({ where: { email: 'e2e-happy-path@example.com' } });
  if (user) {
    await prisma.planEntry.deleteMany({ where: { householdId: user.householdId ?? undefined } });
    await prisma.mealTag.deleteMany({ where: { meal: { createdById: user.id } } });
    await prisma.meal.deleteMany({ where: { createdById: user.id } });
    if (user.householdId) {
      await prisma.tag.deleteMany({ where: { householdId: user.householdId } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    if (user.householdId) {
      await prisma.household.deleteMany({ where: { id: user.householdId } });
    }
  }
});

test('sign in, create household, add a meal, generate a week, and see it transition to cooked', async ({ page }) => {
  // networkidle ensures the client bundle has hydrated and attached the
  // dev-login form's onSubmit handler before we interact with it (otherwise
  // clicking "Continue" submits a plain unhandled HTML form).
  await page.goto('/signin', { waitUntil: 'networkidle' });

  await page.locator('form').getByLabel('Name').fill('E2E Tester');
  await page.locator('form').getByLabel('Email').fill('e2e-happy-path@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.waitForURL('/onboarding');
  await page.getByLabel('Household name').fill('E2E Household');
  await page.getByRole('button', { name: 'Create household' }).click();

  await page.waitForURL('/plan');

  await page.getByRole('link', { name: 'Meals' }).click();
  await page.waitForURL('/meals');
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Test Meal');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Test Meal')).toBeVisible();

  await page.getByRole('link', { name: 'Weekly Plan' }).click();
  await page.waitForURL('/plan');
  await page.getByRole('button', { name: 'Generate week' }).click();
  await expect(page.getByText('E2E Test Meal').first()).toBeVisible();

  // Simulate time passing: backdate today's plan entry directly via Prisma,
  // since the app has no time-travel UI and this test can't wait real days.
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'e2e-happy-path@example.com' } });
  const householdId = user.householdId!;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayEntry = await prisma.planEntry.findFirst({
    where: { householdId, status: 'planned', mealId: { not: null } },
  });
  // Clear any existing entry already on that date (the generated week may
  // include yesterday's date too) to avoid the @@unique([householdId, date]) constraint.
  await prisma.planEntry.deleteMany({
    where: { householdId, date: new Date(yesterday), id: { not: todayEntry!.id } },
  });
  await prisma.planEntry.update({
    where: { id: todayEntry!.id },
    data: { date: new Date(yesterday) },
  });

  await page.reload(); // triggers transitionPastPlannedEntries on the server

  await page.getByRole('link', { name: 'History' }).click();
  await page.waitForURL('/history');
  await expect(page.getByText('E2E Test Meal').first()).toBeVisible();
});
