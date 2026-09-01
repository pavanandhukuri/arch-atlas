import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * 010 SC-002 / FR-002: the importer core has no dependency on the previously
 * bundled agent framework.
 */

const PKG = join(import.meta.dirname, '../../package.json');
const require = createRequire(import.meta.url);

describe('importer core supply chain', () => {
  it('package.json lists no @earendil-works/* (or typebox) dependency', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(all)) {
      expect(name.startsWith('@earendil-works/')).toBe(false);
      expect(name).not.toBe('typebox');
    }
  });

  it('the agent SDK is not resolvable from the importer', () => {
    expect(() => require.resolve('@earendil-works/pi-coding-agent')).toThrow();
    expect(() => require.resolve('@earendil-works/pi-ai')).toThrow();
  });
});
