import { describe, it, expect } from 'vitest';
import { classifyElements } from '../../../src/lib/import/classify-elements';
import type { Candidate, SystemGroup } from '../../../src/lib/import/types';

function makeCandidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'cand_1',
    source: 'order-service',
    target: 'PostgreSQL',
    type: 'database',
    reasoning: 'test',
    confidence: 'high',
    status: 'pending',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

describe('classifyElements', () => {
  it('classifies a database-keyword target as a container with database subtype', () => {
    const candidates = [makeCandidate({ target: 'PostgreSQL', type: 'database' })];
    const elements = classifyElements(candidates, ['order-service']);
    const db = elements.find((e) => e.name === 'PostgreSQL');
    expect(db).toMatchObject({
      kind: 'container',
      containerSubtype: 'database',
      isExternal: false,
    });
  });

  it('classifies a queue-keyword target as a container (never as a system)', () => {
    const candidates = [makeCandidate({ target: 'Kafka', type: 'kafka' })];
    const elements = classifyElements(candidates, ['order-service']);
    const kafka = elements.find((e) => e.name === 'Kafka');
    expect(kafka).toMatchObject({
      kind: 'container',
      containerSubtype: 'default',
      isExternal: false,
    });
  });

  it('classifies a known source repo as a backend-service container', () => {
    const candidates = [makeCandidate({ source: 'order-service', target: 'PostgreSQL' })];
    const elements = classifyElements(candidates, ['order-service']);
    const repo = elements.find((e) => e.name === 'order-service');
    expect(repo).toMatchObject({
      kind: 'container',
      containerSubtype: 'backend-service',
      isExternal: false,
    });
  });

  it('assigns a systemId to a source repo when it belongs to a configured system', () => {
    const candidates = [makeCandidate({ source: 'order-service', target: 'PostgreSQL' })];
    const systems: SystemGroup[] = [{ id: 'sys-1', name: 'Orders', repoNames: ['order-service'] }];
    const elements = classifyElements(candidates, ['order-service'], systems);
    const repo = elements.find((e) => e.name === 'order-service');
    expect(repo?.systemId).toBe('sys-1');
  });

  it('does not assign a systemId to an unrecognized target, even when systems exist', () => {
    const candidates = [
      makeCandidate({ source: 'order-service', target: 'Keycloak', type: 'http' }),
    ];
    const systems: SystemGroup[] = [{ id: 'sys-1', name: 'Orders', repoNames: ['order-service'] }];
    const elements = classifyElements(candidates, ['order-service'], systems);
    const keycloak = elements.find((e) => e.name === 'Keycloak');
    expect(keycloak?.systemId).toBeUndefined();
  });

  it('classifies an unrecognized target as a plain container, never as an external system', () => {
    // Regression guard: the classifier used to guess "well-known externals"
    // (Keycloak, Stripe, etc.) as kind:'system' with isExternal:true. That
    // decision now belongs entirely to the human reviewer.
    const candidates = [
      makeCandidate({ source: 'order-service', target: 'Keycloak', type: 'http' }),
      makeCandidate({ source: 'order-service', target: 'Stripe', type: 'http' }),
    ];
    const elements = classifyElements(candidates, ['order-service']);
    const keycloak = elements.find((e) => e.name === 'Keycloak');
    const stripe = elements.find((e) => e.name === 'Stripe');
    expect(keycloak).toMatchObject({ kind: 'container', isExternal: false });
    expect(stripe).toMatchObject({ kind: 'container', isExternal: false });
  });

  it('classifies an unrecognized target with containerSubtype "backend-service", not the misleading "default"/Queue subtype', () => {
    const candidates = [makeCandidate({ source: 'order-service', target: 'Vault', type: 'http' })];
    const elements = classifyElements(candidates, ['order-service']);
    const vault = elements.find((e) => e.name === 'Vault');
    expect(vault?.containerSubtype).toBe('backend-service');
  });

  it('infers a database container from inbound database-type connections even without a keyword match', () => {
    const candidates = [
      makeCandidate({ source: 'order-service', target: 'CustomDataStore', type: 'database' }),
    ];
    const elements = classifyElements(candidates, ['order-service']);
    const store = elements.find((e) => e.name === 'CustomDataStore');
    expect(store).toMatchObject({
      kind: 'container',
      containerSubtype: 'database',
      isExternal: false,
    });
  });

  it('excludes rejected candidates from classification entirely', () => {
    const candidates = [
      makeCandidate({ source: 'order-service', target: 'PostgreSQL', status: 'accepted' }),
      makeCandidate({
        id: 'cand_2',
        source: 'order-service',
        target: 'RejectedTarget',
        status: 'rejected',
      }),
    ];
    const elements = classifyElements(candidates, ['order-service']);
    expect(elements.find((e) => e.name === 'RejectedTarget')).toBeUndefined();
  });

  it('applies override_name as the displayName for a target', () => {
    const candidates = [
      makeCandidate({
        source: 'order-service',
        target: 'raw-hostname',
        override_name: 'HashiCorp Vault',
      }),
    ];
    const elements = classifyElements(candidates, ['order-service']);
    const target = elements.find((e) => e.name === 'raw-hostname');
    expect(target?.displayName).toBe('HashiCorp Vault');
  });

  it('deduplicates elements referenced by multiple candidates', () => {
    const candidates = [
      makeCandidate({ id: 'cand_1', source: 'order-service', target: 'PostgreSQL' }),
      makeCandidate({ id: 'cand_2', source: 'notification-service', target: 'PostgreSQL' }),
    ];
    const elements = classifyElements(candidates, ['order-service', 'notification-service']);
    expect(elements.filter((e) => e.name === 'PostgreSQL')).toHaveLength(1);
  });
});
