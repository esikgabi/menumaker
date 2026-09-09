import { describe, expect, it } from 'vitest';
import { getWeekDateKeys, toDateKey } from '@/lib/plan';

describe('toDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date('2026-09-08T15:30:00Z'))).toBe('2026-09-08');
  });
});

describe('getWeekDateKeys', () => {
  it('returns the Monday-Sunday keys for a week containing a Tuesday', () => {
    // 2026-09-08 is a Tuesday
    expect(getWeekDateKeys(new Date('2026-09-08T00:00:00Z'))).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('returns the same week when given a Sunday', () => {
    expect(getWeekDateKeys(new Date('2026-09-13T00:00:00Z'))[0]).toBe('2026-09-07');
  });

  it('returns the same week when given a Monday', () => {
    expect(getWeekDateKeys(new Date('2026-09-07T00:00:00Z'))[0]).toBe('2026-09-07');
  });
});
