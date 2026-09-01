import { describe, expect, it } from 'vitest';
import type { AnalysisContext } from '@arch-atlas/llm-importer';
import { renderPrompt, renderVerifyPrompt, RETRY_PREAMBLE } from '../../src/prompt.js';

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

  it('switches the response instruction in tool mode', () => {
    const p = renderPrompt(ctx, 0, 'tool');
    expect(p).toContain('Reply with ONLY the JSON object matching the schema you were given.');
    expect(p).not.toContain('Respond with a SINGLE JSON object and nothing else');
  });

  it('omits the hint / dependency / detected sections when the context has none', () => {
    const bare: AnalysisContext = {
      repoName: 'bare',
      repoPath: '/repos/bare',
      descriptionHint: undefined,
      readmes: [],
      manifests: [],
      dependencySplits: [],
      listing: [],
      sourceExcerpts: [],
      detected: { httpRoutes: [], topics: [] },
      totalBytes: 0,
    };
    const p = renderPrompt(bare);
    expect(p).toContain('name: bare');
    expect(p).not.toContain('hint:');
    expect(p).not.toContain('Declared dependencies');
    expect(p).not.toContain('Detected interface hints');
    expect(p).toContain('## READMEs\n(none)');
    expect(p).toContain('## Directory listing\n(empty)');
  });
});

describe('renderVerifyPrompt', () => {
  it('embeds the draft analysis and, in tool mode, asks for JSON only', () => {
    const draft = { description: 'x', languages: ['Go'] };
    const promptMode = renderVerifyPrompt(ctx, draft, 'prompt');
    expect(promptMode).toContain('"description": "x"');
    expect(promptMode).toContain('Respond with ONLY the corrected JSON object.');

    const toolMode = renderVerifyPrompt(ctx, draft, 'tool');
    expect(toolMode).toContain('Reply with ONLY the corrected JSON object.');
  });
});
