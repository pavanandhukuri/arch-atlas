import { describe, it, expect } from 'vitest';
import { buildModel } from '../../../src/lib/import/build-model';
import type {
  WizardState,
  Candidate,
  ElementConfig,
  SystemGroup,
} from '../../../src/lib/import/types';

const emptyState: WizardState = {
  step: 5,
  reviewFile: null,
  parseError: null,
  baseDiagramError: null,
  candidates: [],
  systems: [],
  elements: [],
  selectedElementId: null,
  reviewFilter: 'all',
  editingCandidateId: null,
  elementFilter: 'all',
};

function candidate(
  overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'source' | 'target'>
): Candidate {
  return {
    type: 'http',
    reasoning: 'x',
    confidence: 'high',
    status: 'accepted',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

describe('buildModel', () => {
  it('creates a system element for each defined SystemGroup', () => {
    const systems: SystemGroup[] = [{ id: 's1', name: 'Core Platform', repoNames: ['a'] }];
    const state: WizardState = {
      ...emptyState,
      systems,
      reviewFile: {
        version: '1.0',
        generated_at: '',
        source_repos: ['a'],
        systems: [],
        candidates: [],
      },
    };

    const model = buildModel(state);

    expect(model.elements).toContainEqual({
      id: 'core-platform',
      kind: 'system',
      name: 'Core Platform',
    });
  });

  it('creates a system element for each source repo left ungrouped', () => {
    const state: WizardState = {
      ...emptyState,
      reviewFile: {
        version: '1.0',
        generated_at: '',
        source_repos: ['user-service'],
        systems: [],
        candidates: [],
      },
    };

    const model = buildModel(state);

    expect(model.elements).toContainEqual({
      id: 'user-service',
      kind: 'system',
      name: 'user-service',
    });
  });

  it('does not create a duplicate system element for a repo already grouped into a SystemGroup', () => {
    const systems: SystemGroup[] = [
      { id: 's1', name: 'user-service', repoNames: ['user-service'] },
    ];
    const state: WizardState = {
      ...emptyState,
      systems,
      reviewFile: {
        version: '1.0',
        generated_at: '',
        source_repos: ['user-service'],
        systems: [],
        candidates: [],
      },
    };

    const model = buildModel(state);

    expect(model.elements.filter((e) => e.id === 'user-service')).toHaveLength(1);
  });

  it('creates a container element parented to its assigned system', () => {
    const systems: SystemGroup[] = [{ id: 's1', name: 'Core', repoNames: [] }];
    const elements: ElementConfig[] = [
      {
        id: 'user-service',
        name: 'user-service',
        displayName: 'User Service',
        kind: 'container',
        containerSubtype: 'backend-service',
        isExternal: false,
        systemId: 's1',
        tags: [],
        technology: 'Node.js',
      },
    ];
    const state: WizardState = { ...emptyState, systems, elements };

    const model = buildModel(state);

    const container = model.elements.find((e) => e.id === 'user-service');
    expect(container).toMatchObject({
      kind: 'container',
      name: 'User Service',
      parentId: 'core',
      containerSubtype: 'backend-service',
      technology: 'Node.js',
    });
  });

  it('creates a system-kind element with isExternal for an external ElementConfig', () => {
    const elements: ElementConfig[] = [
      {
        id: 'stripe',
        name: 'Stripe',
        displayName: 'Stripe',
        kind: 'system',
        isExternal: true,
        tags: [],
      },
    ];
    const state: WizardState = { ...emptyState, elements };

    const model = buildModel(state);

    const stripe = model.elements.find((e) => e.id === 'stripe');
    expect(stripe).toMatchObject({ kind: 'system', name: 'Stripe', isExternal: true });
  });

  it('creates a person element from a person ElementConfig', () => {
    const elements: ElementConfig[] = [
      {
        id: 'customer',
        name: 'Customer',
        displayName: 'Customer',
        kind: 'person',
        isExternal: false,
        tags: [],
      },
    ];
    const state: WizardState = { ...emptyState, elements };

    const model = buildModel(state);

    expect(model.elements.find((e) => e.id === 'customer')).toMatchObject({
      kind: 'person',
      name: 'Customer',
    });
  });

  it('builds a relationship for each accepted candidate, resolved through element names', () => {
    const elements: ElementConfig[] = [
      {
        id: 'user-service',
        name: 'user-service',
        displayName: 'user-service',
        kind: 'container',
        isExternal: false,
        tags: [],
      },
      {
        id: 'notification-service',
        name: 'notification-service',
        displayName: 'notification-service',
        kind: 'container',
        isExternal: false,
        tags: [],
      },
    ];
    const candidates = [
      candidate({ id: 'c1', source: 'user-service', target: 'notification-service', type: 'http' }),
    ];
    const state: WizardState = { ...emptyState, elements, candidates };

    const model = buildModel(state);

    expect(model.relationships).toHaveLength(1);
    expect(model.relationships[0]).toMatchObject({
      sourceId: 'user-service',
      targetId: 'notification-service',
      type: 'calls',
      action: 'Calls',
    });
  });

  it('excludes candidates that are not accepted', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'a', target: 'b', status: 'pending' }),
      candidate({ id: 'c2', source: 'a', target: 'b', status: 'rejected' }),
    ];
    const state: WizardState = { ...emptyState, candidates };

    const model = buildModel(state);

    expect(model.relationships).toHaveLength(0);
  });

  it('uses override_name to resolve the relationship target when present', () => {
    const elements: ElementConfig[] = [
      { id: 'a', name: 'a', displayName: 'a', kind: 'container', isExternal: false, tags: [] },
      {
        id: 'renamed-b',
        name: 'Renamed B',
        displayName: 'Renamed B',
        kind: 'container',
        isExternal: false,
        tags: [],
      },
    ];
    const candidates = [
      candidate({ id: 'c1', source: 'a', target: 'b', override_name: 'Renamed B' }),
    ];
    const state: WizardState = { ...emptyState, elements, candidates };

    const model = buildModel(state);

    expect(model.relationships[0]?.targetId).toBe('renamed-b');
  });

  it('skips a candidate whose source and target resolve to the same element (self-loop)', () => {
    const candidates = [candidate({ id: 'c1', source: 'a', target: 'a' })];
    const state: WizardState = { ...emptyState, candidates };

    const model = buildModel(state);

    expect(model.relationships).toHaveLength(0);
  });

  it('deduplicates relationships with the same source, target, and type', () => {
    const candidates = [
      candidate({ id: 'c1', source: 'a', target: 'b', type: 'http' }),
      candidate({ id: 'c2', source: 'a', target: 'b', type: 'http' }),
    ];
    const state: WizardState = { ...emptyState, candidates };

    const model = buildModel(state);

    expect(model.relationships).toHaveLength(1);
  });

  it('carries override_type onto the relationship as integrationMode', () => {
    const candidates = [candidate({ id: 'c1', source: 'a', target: 'b', override_type: 'REST' })];
    const state: WizardState = { ...emptyState, candidates };

    const model = buildModel(state);

    expect(model.relationships[0]?.integrationMode).toBe('REST');
  });

  it('always produces exactly one root view', () => {
    const model = buildModel(emptyState);
    expect(model.views).toHaveLength(1);
    expect(model.views[0]?.id).toBe('view-root');
    expect(model.views[0]?.level).toBe('system');
  });

  // research finding (build-model.ts): a view laid out with only system-kind
  // elements — or split into separate per-level views — left containers with
  // no computed position, so drilling into a system rendered nothing. The
  // single root view must position every element, containers included, so
  // DiagramViewer's parentId-based drill-down has coordinates to show.
  it('positions every element — including containers nested under a system — in the single root view', () => {
    const systems: SystemGroup[] = [{ id: 's1', name: 'Core', repoNames: [] }];
    const elements: ElementConfig[] = [
      {
        id: 'svc',
        name: 'svc',
        displayName: 'svc',
        kind: 'container',
        isExternal: false,
        systemId: 's1',
        tags: [],
      },
    ];
    const state: WizardState = { ...emptyState, systems, elements };

    const model = buildModel(state);

    const positionedIds = model.views[0]?.layout.nodes.map((n) => n.elementId) ?? [];
    expect(positionedIds).toEqual(expect.arrayContaining(['core', 'svc']));
  });

  it('uses the provided title, defaulting to "Imported Architecture"', () => {
    expect(buildModel(emptyState).metadata.title).toBe('Imported Architecture');
    expect(buildModel(emptyState, 'My Import').metadata.title).toBe('My Import');
  });
});
