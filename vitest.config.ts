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
    // ponytail: unit date tests need a deterministic timezone; Europe/Budapest
    // (east of UTC) is what the product targets and exposes UTC-based "today" bugs.
    env: { TZ: 'Europe/Budapest' },
  },
});
