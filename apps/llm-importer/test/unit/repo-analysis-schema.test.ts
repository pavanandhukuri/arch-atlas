import { describe, it, expect } from 'vitest';
import {
  RepoAnalysisSchema,
  ModelAnalysisSchema,
} from '../../src/analysis/repo-analysis.schema.js';

const fullExample = {
  schemaVersion: '1.0',
  analyzedAt: '2026-08-30T12:00:00.000Z',
  repository: {
    name: 'notification-service',
    path: '/abs/workspace/notification-service',
    description: 'Sends user-facing notifications',
  },
  description:
    'A TypeScript service that consumes notification events from a queue and delivers them over HTTP and email.',
  languages: ['TypeScript'],
  frameworks: ['Express', 'KafkaJS'],
  served: {
    httpRoutes: [{ method: 'POST', path: '/v1/send', filePath: 'src/server.ts' }],
    grpcServices: [],
    topics: [{ name: 'notifications.outbound', direction: 'consume', filePath: 'src/consumer.ts' }],
    datastores: [],
  },
  outbound: [
    {
      target: 'user-service',
      verb: 'calls',
      detail: 'resolves recipient contact info via GET /v1/users/:id',
      confidence: 0.6,
    },
  ],
  analysisStatus: 'complete',
  retryCount: 0,
};

describe('RepoAnalysisSchema', () => {
  it('accepts the full persisted example from the contract', () => {
    const parsed = RepoAnalysisSchema.safeParse(fullExample);
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload missing served (triggers the one retry upstream)', () => {
    const { served, ...withoutServed } = fullExample;
    void served;
    expect(RepoAnalysisSchema.safeParse(withoutServed).success).toBe(false);
  });

  it('rejects an http route whose path lacks a leading slash', () => {
    const bad = {
      ...fullExample,
      served: { ...fullExample.served, httpRoutes: [{ path: 'v1/send' }] },
    };
    expect(RepoAnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it('strips unknown top-level keys rather than rejecting them', () => {
    const chatty = { ...fullExample, notes: 'here is what I found', confidence_overall: 0.9 };
    const parsed = RepoAnalysisSchema.parse(chatty);
    expect('notes' in parsed).toBe(false);
    expect('confidence_overall' in parsed).toBe(false);
    expect(parsed.description).toBe(fullExample.description);
  });

  it('accepts empty served.* and empty outbound (repo with no external interface)', () => {
    const bare = {
      ...fullExample,
      served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
      outbound: [],
    };
    expect(RepoAnalysisSchema.safeParse(bare).success).toBe(true);
  });

  it('defaults an outbound intent confidence is optional', () => {
    const noConf = {
      ...fullExample,
      outbound: [{ target: 'x', verb: 'depends_on', detail: 'uses shared lib' }],
    };
    const parsed = RepoAnalysisSchema.parse(noConf);
    expect(parsed.outbound[0]?.confidence).toBeUndefined();
  });
});

describe('ModelAnalysisSchema (the subset the model is asked for)', () => {
  it('accepts just the model-facing fields', () => {
    const modelOut = {
      description: fullExample.description,
      languages: fullExample.languages,
      frameworks: fullExample.frameworks,
      served: fullExample.served,
      outbound: fullExample.outbound,
    };
    expect(ModelAnalysisSchema.safeParse(modelOut).success).toBe(true);
  });

  it('rejects when served is absent', () => {
    expect(
      ModelAnalysisSchema.safeParse({
        description: 'x',
        languages: [],
        frameworks: [],
        outbound: [],
      }).success
    ).toBe(false);
  });
});
