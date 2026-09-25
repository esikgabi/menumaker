import { describe, expect, it } from 'vitest';
import { generateInviteCode, householdNameSchema, activeWeekdaysSchema } from '@/lib/household';

describe('generateInviteCode', () => {
  it('generates a 12-character uppercase hex code', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-F]{12}$/);
  });
});

describe('householdNameSchema', () => {
  it('accepts a valid name', () => {
    expect(householdNameSchema.safeParse('The Smiths').success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(householdNameSchema.safeParse('').success).toBe(false);
  });

  it('rejects a name over 100 characters', () => {
    expect(householdNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });
});

describe('activeWeekdaysSchema', () => {
  it('accepts all seven weekdays', () => {
    expect(activeWeekdaysSchema.safeParse([0, 1, 2, 3, 4, 5, 6]).success).toBe(true);
  });

  it('accepts a single weekday', () => {
    expect(activeWeekdaysSchema.safeParse([3]).success).toBe(true);
  });

  it('rejects an empty array', () => {
    expect(activeWeekdaysSchema.safeParse([]).success).toBe(false);
  });

  it('rejects a value outside 0-6', () => {
    expect(activeWeekdaysSchema.safeParse([0, 7]).success).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(activeWeekdaysSchema.safeParse([-1, 0]).success).toBe(false);
  });

  it('rejects duplicate values', () => {
    expect(activeWeekdaysSchema.safeParse([0, 0, 1]).success).toBe(false);
  });
});
