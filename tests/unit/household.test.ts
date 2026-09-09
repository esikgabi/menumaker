import { describe, expect, it } from 'vitest';
import { generateInviteCode } from '@/lib/household';

describe('generateInviteCode', () => {
  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });
});
