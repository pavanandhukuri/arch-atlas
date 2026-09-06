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
      '@archatlas/viewer-components': path.resolve(
        __dirname,
        '../../packages/viewer-components/src/index.ts'
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      // React component and hook tests need jsdom
      ['test/components/**', 'jsdom'],
      ['test/hooks/**', 'jsdom'],
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
