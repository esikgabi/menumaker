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

  // Main meal: category select defaults to "Main", so no extra interaction needed.
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Main Meal');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Main Meal')).toBeVisible();

  // Soup meal: explicitly switch the category select from its "Main" default.
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Soup Meal');
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: 'Soup' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('E2E Soup Meal')).toBeVisible();

  await page.getByRole('link', { name: 'Weekly Plan' }).click();
  await page.waitForURL('/plan');
  await page.getByRole('button', { name: 'Generate week' }).click();
  await expect(page.getByText('E2E Main Meal').first()).toBeVisible();
  await expect(page.getByText('E2E Soup Meal').first()).toBeVisible();

  // Skip one day and confirm it collapses to the day-off state instead of
  // showing meal selects.
  await page.getByRole('button', { name: 'Skip this day' }).first().click();
  await expect(page.getByText('No menu (day off)')).toBeVisible();
  await page.getByRole('button', { name: 'Add menu back' }).click();
  await expect(page.getByText('No menu (day off)')).not.toBeVisible();

  // Simulate time passing: backdate today's main-slot plan entry directly via
  // Prisma, since the app has no time-travel UI and this test can't wait real
  // days. Scoped to category: 'main' since each day now has two rows
  // (main + soup) and the test only needs one deterministic target row.
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'e2e-happy-path@example.com' } });
  const householdId = user.householdId!;
  // Must match src/lib/plan's server-local "today" (both run on this machine's
  // TZ). Inlined because Playwright's TS transform can't resolve the @/ alias.
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayEntry = await prisma.planEntry.findFirst({
    where: { householdId, status: 'planned', mealId: { not: null }, category: 'main' },
  });
  // Clear any existing entry already on that date (the generated week may
  // include yesterday's date too) to avoid the
  // @@unique([householdId, date, category]) constraint.
  await prisma.planEntry.deleteMany({
    where: { householdId, date: new Date(yesterday), category: 'main', id: { not: todayEntry!.id } },
  });
  await prisma.planEntry.update({
    where: { id: todayEntry!.id },
    data: { date: new Date(yesterday) },
  });

  await page.reload(); // triggers transitionPastPlannedEntries on the server

  await page.getByRole('link', { name: 'History' }).click();
  await page.waitForURL('/history');
  await expect(page.getByText('E2E Main Meal').first()).toBeVisible();
});
