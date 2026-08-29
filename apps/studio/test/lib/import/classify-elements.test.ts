import { describe, it, expect } from 'vitest';
import { classifyElements } from '../../../src/lib/import/classify-elements';
import type { Candidate } from '../../../src/lib/import/types';

function candidate(
  overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'source' | 'target'>
): Candidate {
  return {
    type: 'http',
    reasoning: 'test',
    confidence: 'medium',
    status: 'pending',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

describe('classifyElements', () => {
  it('classifies a target whose name contains a database keyword as a database container', () => {
    const candidates = [candidate({ id: 'c1', source: 'user-service', target: 'orders-postgres' })];
    const elements = classifyElements(candidates, ['user-service']);

    const db = elements.find((e) => e.name === 'orders-postgres');
    expect(db).toMatchObject({
      kind: 'container',
      containerSubtype: 'database',
      isExternal: false,
    });
  });

  it('classifies a target whose name contains a queue keyword as a container', () => {
    const candidates = [candidate({ id: 'c1', source: 'user-service', target: 'events-kafka' })];
    const elements = classifyElements(candidates, ['user-service']);

    const queue = elements.find((e) => e.name === 'events-kafka');
    expect(queue).toMatchObject({
      kind: 'container',
      containerSubtype: 'default',
      isExternal: false,
    });
  });

  it('classifies a name present in source_repos as a backend-service container', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'notification-service' }),
    ];
    const elements = classifyElements(candidates, ['user-service', 'notification-service']);

    const svc = elements.find((e) => e.name === 'user-service');
    expect(svc).toMatchObject({
      kind: 'container',
      containerSubtype: 'backend-service',
      isExternal: false,
    });
  });

  it('classifies a well-known external name as an external system', () => {
    const candidates = [candidate({ id: 'c1', source: 'user-service', target: 'Stripe' })];
    const elements = classifyElements(candidates, ['user-service']);

    const stripe = elements.find((e) => e.name === 'Stripe');
    expect(stripe).toMatchObject({ kind: 'system', isExternal: true });
  });

  it('classifies a non-repo target with an inbound database connection as a database container', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'legacy-store', type: 'database' }),
    ];
    const elements = classifyElements(candidates, ['user-service']);

    const store = elements.find((e) => e.name === 'legacy-store');
    expect(store).toMatchObject({ kind: 'container', containerSubtype: 'database' });
  });

  it('classifies a non-repo target with an inbound http connection as an external system', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'payments-gateway', type: 'http' }),
    ];
    const elements = classifyElements(candidates, ['user-service']);

    const gw = elements.find((e) => e.name === 'payments-gateway');
    expect(gw).toMatchObject({ kind: 'system', isExternal: true });
  });

  it('falls back to a non-external system for anything unrecognized', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'mystery-thing', type: 'grpc' }),
    ];
    const elements = classifyElements(candidates, ['user-service']);

    const mystery = elements.find((e) => e.name === 'mystery-thing');
    expect(mystery).toMatchObject({ kind: 'system', isExternal: false });
  });

  it('deduplicates names that appear as both a source and a target', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'notification-service' }),
      candidate({ id: 'c2', source: 'notification-service', target: 'user-service' }),
    ];
    const elements = classifyElements(candidates, ['user-service', 'notification-service']);

    expect(elements).toHaveLength(2);
  });

  it('excludes candidates that have been rejected', () => {
    const candidates = [
      candidate({
        id: 'c1',
        source: 'user-service',
        target: 'notification-service',
        status: 'rejected',
      }),
    ];
    const elements = classifyElements(candidates, ['user-service', 'notification-service']);

    expect(elements).toHaveLength(0);
  });

  it('uses override_name as the displayName for a target when present', () => {
    const candidates = [
      candidate({
        id: 'c1',
        source: 'user-service',
        target: 'payments-gateway',
        override_name: 'Payments API',
      }),
    ];
    const elements = classifyElements(candidates, ['user-service']);

    const gw = elements.find((e) => e.name === 'payments-gateway');
    expect(gw?.displayName).toBe('Payments API');
  });

  it('produces url-safe slug ids derived from the element name', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'Orders Postgres!' }),
    ];
    const elements = classifyElements(candidates, ['user-service']);

    const el = elements.find((e) => e.name === 'Orders Postgres!');
    expect(el?.id).toBe('orders-postgres');
  });
});
