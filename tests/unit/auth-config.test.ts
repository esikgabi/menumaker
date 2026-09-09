import { describe, expect, it } from 'vitest';
import { assertMockAuthSafe } from '@/lib/auth-guard';

describe('assertMockAuthSafe', () => {
  it('throws when mock auth is enabled in production', () => {
    expect(() => assertMockAuthSafe({ enableMockAuth: true, nodeEnv: 'production' })).toThrow(
      /ENABLE_MOCK_AUTH/,
    );
  });

  it('does not throw when mock auth is enabled in development', () => {
    expect(() => assertMockAuthSafe({ enableMockAuth: true, nodeEnv: 'development' })).not.toThrow();
  });

  it('does not throw when mock auth is disabled in production', () => {
    expect(() => assertMockAuthSafe({ enableMockAuth: false, nodeEnv: 'production' })).not.toThrow();
  });
});
