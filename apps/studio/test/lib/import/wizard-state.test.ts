import { describe, it, expect } from 'vitest';
import { wizardReducer } from '../../../src/lib/import/wizard-state';
import type { WizardState, ElementConfig, SystemGroup } from '../../../src/lib/import/types';

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    step: 1,
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
    ...overrides,
  };
}

function makeElement(overrides: Partial<ElementConfig>): ElementConfig {
  return {
    id: 'elem-1',
    name: 'Elem',
    displayName: 'Elem',
    kind: 'container',
    isExternal: false,
    tags: [],
    ...overrides,
  };
}

describe('wizardReducer', () => {
  describe('CREATE_SYSTEM', () => {
    it('appends a new system group', () => {
      const state = baseState();
      const next = wizardReducer(state, { type: 'CREATE_SYSTEM', id: 'sys-1', name: 'Payments' });
      expect(next.systems).toEqual([{ id: 'sys-1', name: 'Payments', repoNames: [] }]);
    });
  });

  describe('BULK_ASSIGN_SYSTEM', () => {
    const systems: SystemGroup[] = [{ id: 'sys-1', name: 'Payments', repoNames: [] }];

    it('assigns the systemId and marks reviewed for selected containers', () => {
      const state = baseState({
        systems,
        elements: [
          makeElement({ id: 'a', kind: 'container' }),
          makeElement({ id: 'b', kind: 'container' }),
          makeElement({ id: 'c', kind: 'container' }),
        ],
      });
      const next = wizardReducer(state, {
        type: 'BULK_ASSIGN_SYSTEM',
        ids: ['a', 'b'],
        systemId: 'sys-1',
      });
      expect(next.elements.find((e) => e.id === 'a')).toMatchObject({
        systemId: 'sys-1',
        reviewed: true,
      });
      expect(next.elements.find((e) => e.id === 'b')).toMatchObject({
        systemId: 'sys-1',
        reviewed: true,
      });
      // Not selected — untouched
      const untouched = next.elements.find((e) => e.id === 'c');
      expect(untouched?.systemId).toBeUndefined();
      expect(untouched?.reviewed).toBeUndefined();
    });

    it('does not assign a system to a non-container element in the selection', () => {
      const state = baseState({
        systems,
        elements: [makeElement({ id: 'a', kind: 'system', isExternal: true })],
      });
      const next = wizardReducer(state, {
        type: 'BULK_ASSIGN_SYSTEM',
        ids: ['a'],
        systemId: 'sys-1',
      });
      const el = next.elements.find((e) => e.id === 'a');
      expect(el?.systemId).toBeUndefined();
      expect(el?.kind).toBe('system');
    });
  });

  describe('BULK_MARK_EXTERNAL', () => {
    it('converts selected containers into external systems and marks reviewed', () => {
      const state = baseState({
        elements: [
          makeElement({
            id: 'a',
            kind: 'container',
            containerSubtype: 'backend-service',
            systemId: 'sys-1',
          }),
          makeElement({ id: 'b', kind: 'container' }),
        ],
      });
      const next = wizardReducer(state, { type: 'BULK_MARK_EXTERNAL', ids: ['a'] });
      const a = next.elements.find((e) => e.id === 'a');
      expect(a).toMatchObject({
        kind: 'system',
        isExternal: true,
        containerSubtype: undefined,
        systemId: undefined,
        reviewed: true,
      });
      // Not selected — untouched
      const b = next.elements.find((e) => e.id === 'b');
      expect(b?.kind).toBe('container');
      expect(b?.reviewed).toBeUndefined();
    });

    it('leaves elements outside the selection completely unchanged', () => {
      const untouched = makeElement({ id: 'z', kind: 'container', systemId: 'sys-1' });
      const state = baseState({ elements: [untouched] });
      const next = wizardReducer(state, { type: 'BULK_MARK_EXTERNAL', ids: ['does-not-exist'] });
      expect(next.elements).toEqual([untouched]);
    });
  });

  describe('LOAD_REVIEW', () => {
    it('preloads systems from the review file and resets element/review state', () => {
      const state = baseState({
        elements: [makeElement({ id: 'stale' })],
        selectedElementId: 'stale',
      });
      const next = wizardReducer(state, {
        type: 'LOAD_REVIEW',
        file: {
          version: '1.0',
          generated_at: '2026-01-01T00:00:00Z',
          source_repos: ['svc-a'],
          systems: [{ name: 'Core Platform', repositories: ['svc-a'] }],
          candidates: [],
        },
        candidates: [],
      });
      expect(next.systems).toEqual([
        { id: 'core-platform', name: 'Core Platform', repoNames: ['svc-a'] },
      ]);
      expect(next.elements).toEqual([]);
      expect(next.selectedElementId).toBeNull();
    });
  });

  describe('UPDATE_ELEMENT', () => {
    it('replaces an existing element by id', () => {
      const state = baseState({ elements: [makeElement({ id: 'a', displayName: 'Old' })] });
      const updated = makeElement({ id: 'a', displayName: 'New' });
      const next = wizardReducer(state, { type: 'UPDATE_ELEMENT', config: updated });
      expect(next.elements).toEqual([updated]);
    });

    it('appends a new element when the id does not already exist', () => {
      const state = baseState({ elements: [] });
      const created = makeElement({ id: 'a' });
      const next = wizardReducer(state, { type: 'UPDATE_ELEMENT', config: created });
      expect(next.elements).toEqual([created]);
    });
  });

  describe('NEXT_STEP / PREV_STEP', () => {
    it('does not advance past the final step (6)', () => {
      const state = baseState({ step: 6 });
      const next = wizardReducer(state, { type: 'NEXT_STEP' });
      expect(next.step).toBe(6);
    });

    it('does not go back before the first step (1)', () => {
      const state = baseState({ step: 1 });
      const next = wizardReducer(state, { type: 'PREV_STEP' });
      expect(next.step).toBe(1);
    });
  });
});
