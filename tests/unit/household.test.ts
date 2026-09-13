import { describe, expect, it } from 'vitest';
import { generateInviteCode, householdNameSchema } from '@/lib/household';

describe('generateInviteCode', () => {
  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
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
