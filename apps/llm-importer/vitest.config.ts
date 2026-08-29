import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'vendor/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['vendor/**', 'test/**', 'dist/**', '**/*.config.ts'],
      thresholds: {
        // Constitution Definition of Done: total coverage MUST be >= 80% for changed projects.
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
