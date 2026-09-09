export function assertMockAuthSafe(env: { enableMockAuth: boolean; nodeEnv: string | undefined }) {
  if (env.enableMockAuth && env.nodeEnv === 'production') {
    throw new Error(
      'ENABLE_MOCK_AUTH must not be set to true when NODE_ENV=production. ' +
        'Remove ENABLE_MOCK_AUTH from the production environment.',
    );
  }
}
