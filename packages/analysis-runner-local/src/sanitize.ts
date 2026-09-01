/**
 * Post-response cleanup of a model analysis. Relocated verbatim from the
 * importer's former `analyze-repo.ts` (008 research D14.2 / D14.9) as part of
 * 010 — the importer core no longer makes a model call, so this belongs with the
 * producer.
 */

/** Names that are build/test/lint tooling, never the application framework. */
const NON_FRAMEWORK_DEPS = new Set(
  [
    'vitest',
    'jest',
    'mocha',
    'chai',
    'ava',
    'jasmine',
    'karma',
    'cypress',
    'playwright',
    '@playwright/test',
    'testing-library',
    '@testing-library/react',
    '@testing-library/dom',
    'supertest',
    'nock',
    'msw',
    'eslint',
    'prettier',
    'tslint',
    'stylelint',
    'typescript',
    'ts-node',
    'tsx',
    'tsup',
    'type-fest',
    'nodemon',
    'concurrently',
    'npm-run-all',
    'rimraf',
    'husky',
    'lint-staged',
    'turbo',
    'nx',
    'lerna',
    'webpack',
    'rollup',
    'esbuild',
    'parcel',
    'gulp',
    'grunt',
    'babel',
    '@babel/core',
    'swc',
    '@swc/core',
    'vite',
    'browserslist',
    'postcss',
    'autoprefixer',
    'commitlint',
    'semantic-release',
    'changesets',
    '@changesets/cli',
    'dotenv',
    'cross-env',
  ].map((s) => s.toLowerCase())
);

/** Operational / infra endpoints that are not architectural interfaces. */
const OPERATIONAL_PATH_RE =
  /^\/(actuator($|\/)|health($|z|check$)|healthz$|readyz$|livez$|ready$|live$|metrics$|prometheus$|ping$|status$|version$|info$|favicon\.ico$|robots\.txt$|\.well-known($|\/))/i;

export function sanitizeServed<T extends { httpRoutes: Array<{ path: string }> }>(served: T): T {
  return {
    ...served,
    httpRoutes: served.httpRoutes.filter((r) => !OPERATIONAL_PATH_RE.test(r.path)),
  };
}

export function sanitizeFrameworks(frameworks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of frameworks) {
    const f = raw.trim();
    if (!f) continue;
    const lc = f.toLowerCase();
    const base = lc.startsWith('@types/') ? '@types' : lc.replace(/@[\d.^~>=<\s|-]+$/, '');
    if (lc.startsWith('@types/') || NON_FRAMEWORK_DEPS.has(base) || NON_FRAMEWORK_DEPS.has(lc)) {
      continue;
    }
    if (!seen.has(lc)) {
      seen.add(lc);
      out.push(f);
    }
  }
  return out;
}
