import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: [
          './apps/*/tsconfig.json',
          './packages/*/tsconfig.json',
          './packages/*/tsconfig.test.json',
        ],
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

      // Numbers and booleans in template literals are universally valid — strictTypeChecked
      // forbids them by default but that is excessively pedantic for a TypeScript codebase.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],

      // Honour the TypeScript convention of prefixing intentionally-unused identifiers
      // with an underscore (e.g. _event, _proposal).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off', // use the TS-aware version above instead
    },
  },
  {
    // The renderer package wraps PixiJS whose types are declared via DefinitelyTyped
    // and cause many false-positive errors under strictTypeChecked. Disable the
    // unsafe-* family plus other rules that clash with PixiJS event-handler patterns.
    files: ['packages/renderer/src/**/*.ts', 'packages/renderer/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    // Renderer tests use non-null assertions to access PixiJS-dependent fixtures.
    files: ['packages/renderer/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The studio is a React/Next.js app. Several strictTypeChecked rules conflict with
    // idiomatic React patterns (arrow callbacks returning setState, async onClick handlers,
    // non-null assertions after conditional checks). Disable those for all studio src files.
    files: ['apps/studio/src/**/*.ts', 'apps/studio/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    // Storage service providers interact with browser APIs (File System Access API,
    // Google Drive REST, IndexedDB) whose TypeScript types are incomplete or typed as
    // `any`. Disable the unsafe-* family for these files only.
    files: [
      'apps/studio/src/services/storage/local-file-provider.ts',
      'apps/studio/src/services/storage/google-drive-provider.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '.next/', '.turbo/', '*.config.*'],
  }
);
