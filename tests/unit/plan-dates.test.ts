import { describe, expect, it } from 'vitest';
import { getWeekDateKeys, getFutureWeekDateKeys, toDateKey } from '@/lib/plan';

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

describe('getFutureWeekDateKeys', () => {
  it('returns all 7 days when today is Monday', () => {
    const monday = new Date('2026-09-07T00:00:00Z');
    expect(getFutureWeekDateKeys(monday, monday)).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('returns Tuesday through Sunday when today is Tuesday', () => {
    const tuesday = new Date('2026-09-08T00:00:00Z');
    expect(getFutureWeekDateKeys(tuesday, tuesday)).toEqual([
      '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('returns Wednesday through Sunday when today is Wednesday', () => {
    const wednesday = new Date('2026-09-09T00:00:00Z');
    expect(getFutureWeekDateKeys(wednesday, wednesday)).toEqual([
      '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('returns only Sunday when today is Sunday', () => {
    const sunday = new Date('2026-09-13T00:00:00Z');
    expect(getFutureWeekDateKeys(sunday, sunday)).toEqual(['2026-09-13']);
  });

  it('uses the reference date to compute the week but the today date to filter', () => {
    // reference = Monday of the week; today = Thursday of that same week
    const monday = new Date('2026-09-07T00:00:00Z');
    const thursday = new Date('2026-09-10T00:00:00Z');
    expect(getFutureWeekDateKeys(monday, thursday)).toEqual([
      '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });
});
