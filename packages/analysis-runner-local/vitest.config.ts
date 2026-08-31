import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Dev/test: resolve the importer's public entrypoint from source so the
      // runner does not need a prior `@arch-atlas/llm-importer` build. The
      // published package still resolves via its `exports` map.
      '@arch-atlas/llm-importer': fileURLToPath(
        new URL('../../apps/llm-importer/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['test/**', 'dist/**', '**/*.config.ts', 'src/index.ts', 'src/cli.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
