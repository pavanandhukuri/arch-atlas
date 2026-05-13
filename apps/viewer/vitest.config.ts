import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@arch-atlas/viewer-components': path.resolve(
        __dirname,
        '../../packages/viewer-components/src/index.ts'
      ),
      '@arch-atlas/renderer': path.resolve(__dirname, '../../packages/renderer/src/index.ts'),
      '@arch-atlas/core-model': path.resolve(__dirname, '../../packages/core-model/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
