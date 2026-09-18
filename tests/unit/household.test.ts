import { describe, expect, it } from 'vitest';
import { generateInviteCode, householdNameSchema } from '@/lib/household';

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
