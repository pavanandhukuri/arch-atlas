/* eslint-disable @typescript-eslint/unbound-method -- tool.execute is a plain arrow fn, no `this` */
import { describe, it, expect } from 'vitest';
import { Value } from 'typebox/value';
import {
  createSubmitAnalysisTool,
  SubmitAnalysisParams,
} from '../../src/analysis/submit-analysis-tool.js';
import { ModelAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';

const VALID = {
  description: 'A notification service.',
  languages: ['Go'],
  frameworks: ['Gin'],
  served: {
    httpRoutes: [{ method: 'POST', path: '/v1/send', filePath: 'main.go' }],
    grpcServices: [],
    topics: [{ name: 'user-created', direction: 'consume' }],
    datastores: [],
  },
  outbound: [{ target: 'user-service', verb: 'calls', detail: 'looks up recipient' }],
};

describe('SubmitAnalysisParams (TypeBox) drift guard vs ModelAnalysisSchema (zod)', () => {
  it('both accept the same valid object', () => {
    expect(Value.Check(SubmitAnalysisParams, VALID)).toBe(true);
    expect(ModelAnalysisSchema.safeParse(VALID).success).toBe(true);
  });

  it('both reject a route path without a leading slash', () => {
    const bad = {
      ...VALID,
      served: { ...VALID.served, httpRoutes: [{ path: 'v1/send' }] },
    };
    expect(Value.Check(SubmitAnalysisParams, bad)).toBe(false);
    expect(ModelAnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it('both reject a missing served block', () => {
    const { served, ...rest } = VALID;
    void served;
    expect(Value.Check(SubmitAnalysisParams, rest)).toBe(false);
    expect(ModelAnalysisSchema.safeParse(rest).success).toBe(false);
  });

  it('both reject an unknown outbound verb', () => {
    const bad = { ...VALID, outbound: [{ target: 'x', verb: 'frobnicates', detail: 'y' }] };
    expect(Value.Check(SubmitAnalysisParams, bad)).toBe(false);
    expect(ModelAnalysisSchema.safeParse(bad).success).toBe(false);
  });
});

describe('createSubmitAnalysisTool', () => {
  it('captures and zod-revalidates params on execute; getResult() null before any call', async () => {
    const { tool, getResult } = createSubmitAnalysisTool();
    expect(tool.name).toBe('submit_analysis');
    expect(tool.constrainedSampling).toEqual({ type: 'json_schema', strict: 'prefer' });
    expect(getResult()).toBeNull();

    const res = await tool.execute('tc1', VALID, undefined, undefined, {} as never);
    expect(res.terminate).toBe(true);
    expect(getResult()?.served.httpRoutes[0]?.path).toBe('/v1/send');
  });

  it('does not capture params that fail zod revalidation', async () => {
    const { tool, getResult } = createSubmitAnalysisTool();
    await tool.execute('tc1', { description: 'x' }, undefined, undefined, {} as never);
    expect(getResult()).toBeNull();
  });
});
