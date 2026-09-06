import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
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
});
