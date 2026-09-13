import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    // ponytail: integration test files share one DB and truncate tables in
    // beforeEach, so running files in parallel races and flakes. Sequential
    // is fine at this suite's size; revisit with per-file DB isolation if
    // the suite grows large enough for this to matter.
    fileParallelism: false,
  },
});
