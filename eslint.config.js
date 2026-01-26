import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.base.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Enforce package boundary rules: no deep imports across packages
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@arch-atlas/*/src/*', '@arch-atlas/*/dist/*'],
              message:
                'Direct imports from package internals are prohibited. Use the public API exported from the package entrypoint.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '.next/', '.turbo/', '*.config.*'],
  }
);
