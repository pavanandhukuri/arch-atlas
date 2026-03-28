import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    // Use automatic JSX runtime so components don't need `import React`
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      // React component tests need jsdom
      ['test/components/**', 'jsdom'],
      ['test/app/**', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/app/layout.tsx'],
    },
  },
});
