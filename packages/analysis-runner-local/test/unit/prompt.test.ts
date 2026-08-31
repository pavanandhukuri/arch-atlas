import { describe, expect, it } from 'vitest';
import type { AnalysisContext } from '@arch-atlas/llm-importer';
import { renderPrompt, RETRY_PREAMBLE } from '../../src/prompt.js';

const ctx: AnalysisContext = {
  repoName: 'orders',
  repoPath: '/repos/orders',
  descriptionHint: 'handles orders',
  readmes: [{ relPath: 'README.md', text: '# orders' }],
  manifests: [{ relPath: 'go.mod', text: 'module orders' }],
  dependencySplits: [
    {
      relPath: 'package.json',
      dependencies: ['express'],
      devDependencies: ['vitest'],
      peerDependencies: [],
    },
  ],
  listing: ['cmd/main.go', 'internal/http.go'],
  sourceExcerpts: [{ relPath: 'internal/http.go', text: 'r.GET("/v1/orders")', truncated: true }],
  detected: {
    httpRoutes: [{ method: 'GET', path: '/v1/orders', relPath: 'internal/http.go', line: 3 }],
    topics: [{ name: 'orders.created', role: 'pub', relPath: 'x.go', line: 1 }],
  },
  totalBytes: 1234,
};

describe('renderPrompt', () => {
  it('includes repo name, hint, dependency split, listing, source, and detected hints', () => {
    const p = renderPrompt(ctx);
    expect(p).toContain('name: orders');
    expect(p).toContain('hint: handles orders');
    expect(p).toContain('dev (IGNORE for frameworks): vitest');
    expect(p).toContain('internal/http.go (truncated)');
    expect(p).toContain('route: GET /v1/orders');
    expect(p).toContain('topic: orders.created');
    expect(p).not.toContain(RETRY_PREAMBLE.trimEnd());
  });

  it('prepends the retry preamble on attempt 1', () => {
    expect(renderPrompt(ctx, 1)).toContain(RETRY_PREAMBLE.trimEnd());
  });
});
