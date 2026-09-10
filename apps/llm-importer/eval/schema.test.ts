import { describe, it, expect } from 'vitest';
import { EvalConfigSchema, WorkspaceGroundTruthSchema } from './schema.js';

const baseGt = {
  repos: {
    'svc-a': { role: 'a', languages: ['Go'], frameworks: [], served: {}, outbound: [] },
    'svc-b': { role: 'b', languages: ['Go'], frameworks: [], served: {}, outbound: [] },
  },
  connections: [{ from: 'svc-a', to: 'svc-b' }],
  externalSystems: ['Keycloak'],
};

describe('WorkspaceGroundTruthSchema', () => {
  it('accepts a consistent ground truth', () => {
    expect(() => WorkspaceGroundTruthSchema.parse(baseGt)).not.toThrow();
  });

  it('accepts an external system as a connection endpoint', () => {
    expect(() =>
      WorkspaceGroundTruthSchema.parse({
        ...baseGt,
        connections: [...baseGt.connections, { from: 'svc-a', to: 'Keycloak', kind: 'auth' }],
      })
    ).not.toThrow();
  });

  it('rejects a connection endpoint that is neither a repo nor an external system (FR-006)', () => {
    expect(() =>
      WorkspaceGroundTruthSchema.parse({
        ...baseGt,
        connections: [{ from: 'svc-a', to: 'svc-typo' }],
      })
    ).toThrow(/svc-typo.*neither a repo key nor an externalSystems entry/s);
  });

  it('rejects an empty repo name in the map values', () => {
    expect(() =>
      WorkspaceGroundTruthSchema.parse({
        ...baseGt,
        repos: { 'svc-a': { role: '', languages: [], frameworks: [], served: {} } },
      })
    ).toThrow();
  });
});

describe('EvalConfigSchema', () => {
  it('requires at least one repo', () => {
    expect(() =>
      EvalConfigSchema.parse({ name: 'x', workspace: { local: '../repos' }, repos: [] })
    ).toThrow();
  });

  it('accepts a well-formed config', () => {
    expect(
      EvalConfigSchema.parse({
        name: 'x',
        workspace: { local: '../repos' },
        repos: [{ name: 'svc-a', path: 'svc-a' }],
      }).repos
    ).toHaveLength(1);
  });
});
