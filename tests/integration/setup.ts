process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://test:test@localhost:5433/menumaker_test?schema=public';
