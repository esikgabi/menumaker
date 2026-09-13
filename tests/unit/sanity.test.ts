import { describe, expect, it } from 'vitest';

function add(a: number, b: number) {
  return a + b;
}

describe('sanity', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
