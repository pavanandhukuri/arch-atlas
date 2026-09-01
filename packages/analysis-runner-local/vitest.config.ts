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
    exclude: ['**/node_modules/**', '**/dist/**', 'eval/golden/*/workspace/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Coverage is measured over the shipped package source only. `eval/` is a
      // dev-only harness (its one piece of real logic, `score.ts`, has its own
      // test); `src/index.ts` is a re-export barrel and `src/cli.ts` is thin
      // arg wiring exercised by `cli.test.ts` but not counted.
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/cli.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
