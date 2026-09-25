import { describe, expect, it } from 'vitest';
import { mealInputSchema } from '@/lib/meal';

describe('mealInputSchema', () => {
  it('accepts a valid meal with tags', () => {
    const result = mealInputSchema.safeParse({
      name: 'Spaghetti Bolognese',
      note: 'Kids love this one',
      tagIds: ['tag_1', 'tag_2'],
      category: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a meal with no note and no tags', () => {
    const result = mealInputSchema.safeParse({ name: 'Grilled Cheese', tagIds: [], category: 'main' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = mealInputSchema.safeParse({ name: '', tagIds: [], category: 'main' });
    expect(result.success).toBe(false);
  });

  it('rejects a name over 100 characters', () => {
    const result = mealInputSchema.safeParse({ name: 'a'.repeat(101), tagIds: [], category: 'main' });
    expect(result.success).toBe(false);
  });

  it('rejects a note over 500 characters', () => {
    const result = mealInputSchema.safeParse({ name: 'X', note: 'a'.repeat(501), tagIds: [], category: 'main' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid meal with category "soup"', () => {
    const result = mealInputSchema.safeParse({
      name: 'Tomato Soup',
      note: '',
      tagIds: [],
      category: 'soup',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid meal with category "main"', () => {
    const result = mealInputSchema.safeParse({
      name: 'Spaghetti',
      note: '',
      tagIds: [],
      category: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing category', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category value', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'dessert' });
    expect(result.success).toBe(false);
  });

  it('defaults durationDays to 1 when omitted', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.durationDays).toBe(1);
  });

  it('accepts an explicit durationDays', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: 3 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.durationDays).toBe(3);
  });

  it('rejects durationDays of 0', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative durationDays', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer durationDays', () => {
    const result = mealInputSchema.safeParse({ name: 'X', tagIds: [], category: 'main', durationDays: 1.5 });
    expect(result.success).toBe(false);
  });
});
