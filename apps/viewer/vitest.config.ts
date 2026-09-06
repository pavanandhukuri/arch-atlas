import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@archatlas/viewer-components': path.resolve(
        __dirname,
        '../../packages/viewer-components/src/index.ts'
      ),
      '@archatlas/renderer': path.resolve(__dirname, '../../packages/renderer/src/index.ts'),
      '@archatlas/core-model': path.resolve(__dirname, '../../packages/core-model/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
