import { describe, it, expect } from 'vitest';
import { wizardReducer } from '../../../src/lib/import/wizard-state';
import type {
  WizardState,
  ReviewFile,
  Candidate,
  ElementConfig,
} from '../../../src/lib/import/types';

const initialState: WizardState = {
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
};

function makeReviewFile(): ReviewFile {
  return {
    version: '1.0',
    generated_at: '2026-08-01T00:00:00.000Z',
    source_repos: ['a', 'b'],
    candidates: [],
  };
}

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1',
    source: 'a',
    target: 'b',
    type: 'http',
    reasoning: 'x',
    confidence: 'high',
    status: 'pending',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

describe('wizardReducer', () => {
  it('LOAD_REVIEW replaces the review file/candidates and resets downstream wizard state', () => {
    const dirty: WizardState = {
      ...initialState,
      systems: [{ id: 's1', name: 'S', repoNames: [] }],
      selectedElementId: 'x',
      reviewFilter: 'accepted',
      editingCandidateId: 'c1',
    };
    const file = makeReviewFile();
    const candidates = [makeCandidate()];

    const next = wizardReducer(dirty, { type: 'LOAD_REVIEW', file, candidates });

    expect(next.reviewFile).toBe(file);
    expect(next.candidates).toBe(candidates);
    expect(next.parseError).toBeNull();
    expect(next.systems).toEqual([]);
    expect(next.elements).toEqual([]);
    expect(next.selectedElementId).toBeNull();
    expect(next.reviewFilter).toBe('all');
    expect(next.editingCandidateId).toBeNull();
  });

  it('SET_PARSE_ERROR records the error and clears any loaded review data', () => {
    const loaded: WizardState = {
      ...initialState,
      reviewFile: makeReviewFile(),
      candidates: [makeCandidate()],
    };

    const next = wizardReducer(loaded, { type: 'SET_PARSE_ERROR', error: 'bad yaml' });

    expect(next.parseError).toBe('bad yaml');
    expect(next.reviewFile).toBeNull();
    expect(next.candidates).toEqual([]);
  });

  it('SET_BASE_DIAGRAM_ERROR and CLEAR_BASE_DIAGRAM_ERROR toggle the error field', () => {
    const withError = wizardReducer(initialState, {
      type: 'SET_BASE_DIAGRAM_ERROR',
      error: 'bad json',
    });
    expect(withError.baseDiagramError).toBe('bad json');

    const cleared = wizardReducer(withError, { type: 'CLEAR_BASE_DIAGRAM_ERROR' });
    expect(cleared.baseDiagramError).toBeNull();
  });

  it('NEXT_STEP advances by one but never past step 5', () => {
    const atFive: WizardState = { ...initialState, step: 5 };
    expect(wizardReducer(initialState, { type: 'NEXT_STEP' }).step).toBe(2);
    expect(wizardReducer(atFive, { type: 'NEXT_STEP' }).step).toBe(5);
  });

  it('PREV_STEP retreats by one but never below step 1', () => {
    const atThree: WizardState = { ...initialState, step: 3 };
    expect(wizardReducer(atThree, { type: 'PREV_STEP' }).step).toBe(2);
    expect(wizardReducer(initialState, { type: 'PREV_STEP' }).step).toBe(1);
  });

  it('GO_TO_STEP jumps directly to the requested step', () => {
    expect(wizardReducer(initialState, { type: 'GO_TO_STEP', step: 4 }).step).toBe(4);
  });

  it('CREATE_SYSTEM appends a new empty system group', () => {
    const next = wizardReducer(initialState, { type: 'CREATE_SYSTEM', id: 's1', name: 'Core' });
    expect(next.systems).toEqual([{ id: 's1', name: 'Core', repoNames: [] }]);
  });

  it('DELETE_SYSTEM removes the system and unassigns any elements pointing at it', () => {
    const withSystem: WizardState = {
      ...initialState,
      systems: [{ id: 's1', name: 'Core', repoNames: ['a'] }],
      elements: [
        {
          id: 'e1',
          name: 'a',
          displayName: 'a',
          kind: 'container',
          isExternal: false,
          tags: [],
          systemId: 's1',
        },
      ],
    };

    const next = wizardReducer(withSystem, { type: 'DELETE_SYSTEM', systemId: 's1' });

    expect(next.systems).toEqual([]);
    expect(next.elements[0]?.systemId).toBeUndefined();
  });

  it('RENAME_SYSTEM updates only the matching system', () => {
    const withSystems: WizardState = {
      ...initialState,
      systems: [
        { id: 's1', name: 'Old', repoNames: [] },
        { id: 's2', name: 'Other', repoNames: [] },
      ],
    };

    const next = wizardReducer(withSystems, { type: 'RENAME_SYSTEM', systemId: 's1', name: 'New' });

    expect(next.systems).toEqual([
      { id: 's1', name: 'New', repoNames: [] },
      { id: 's2', name: 'Other', repoNames: [] },
    ]);
  });

  it('ASSIGN_REPO_TO_SYSTEM moves a repo from one system to another, never duplicating it', () => {
    const withSystems: WizardState = {
      ...initialState,
      systems: [
        { id: 's1', name: 'A', repoNames: ['repo-x'] },
        { id: 's2', name: 'B', repoNames: [] },
      ],
    };

    const next = wizardReducer(withSystems, {
      type: 'ASSIGN_REPO_TO_SYSTEM',
      repoName: 'repo-x',
      systemId: 's2',
    });

    expect(next.systems).toEqual([
      { id: 's1', name: 'A', repoNames: [] },
      { id: 's2', name: 'B', repoNames: ['repo-x'] },
    ]);
  });

  it('ASSIGN_REPO_TO_SYSTEM is a no-op when the repo is already in the target system', () => {
    const withSystems: WizardState = {
      ...initialState,
      systems: [{ id: 's1', name: 'A', repoNames: ['repo-x'] }],
    };

    const next = wizardReducer(withSystems, {
      type: 'ASSIGN_REPO_TO_SYSTEM',
      repoName: 'repo-x',
      systemId: 's1',
    });

    expect(next.systems).toEqual([{ id: 's1', name: 'A', repoNames: ['repo-x'] }]);
  });

  it('UNASSIGN_REPO removes a repo from every system', () => {
    const withSystems: WizardState = {
      ...initialState,
      systems: [
        { id: 's1', name: 'A', repoNames: ['repo-x'] },
        { id: 's2', name: 'B', repoNames: ['repo-x', 'repo-y'] },
      ],
    };

    const next = wizardReducer(withSystems, { type: 'UNASSIGN_REPO', repoName: 'repo-x' });

    expect(next.systems).toEqual([
      { id: 's1', name: 'A', repoNames: [] },
      { id: 's2', name: 'B', repoNames: ['repo-y'] },
    ]);
  });

  it('SET_CANDIDATE_STATUS updates only the matching candidate', () => {
    const withCandidates: WizardState = {
      ...initialState,
      candidates: [makeCandidate({ id: 'c1' }), makeCandidate({ id: 'c2' })],
    };

    const next = wizardReducer(withCandidates, {
      type: 'SET_CANDIDATE_STATUS',
      id: 'c1',
      status: 'accepted',
    });

    expect(next.candidates.find((c) => c.id === 'c1')?.status).toBe('accepted');
    expect(next.candidates.find((c) => c.id === 'c2')?.status).toBe('pending');
  });

  it('SET_CANDIDATE_OVERRIDE sets override_name and override_type on the matching candidate', () => {
    const withCandidates: WizardState = {
      ...initialState,
      candidates: [makeCandidate({ id: 'c1' })],
    };

    const next = wizardReducer(withCandidates, {
      type: 'SET_CANDIDATE_OVERRIDE',
      id: 'c1',
      overrideName: 'Renamed',
      overrideType: 'REST',
    });

    expect(next.candidates[0]).toMatchObject({ override_name: 'Renamed', override_type: 'REST' });
  });

  it('ACCEPT_ALL_HIGH_CONFIDENCE accepts only pending high-confidence candidates', () => {
    const withCandidates: WizardState = {
      ...initialState,
      candidates: [
        makeCandidate({ id: 'c1', confidence: 'high', status: 'pending' }),
        makeCandidate({ id: 'c2', confidence: 'high', status: 'rejected' }),
        makeCandidate({ id: 'c3', confidence: 'low', status: 'pending' }),
      ],
    };

    const next = wizardReducer(withCandidates, { type: 'ACCEPT_ALL_HIGH_CONFIDENCE' });

    expect(next.candidates.find((c) => c.id === 'c1')?.status).toBe('accepted');
    expect(next.candidates.find((c) => c.id === 'c2')?.status).toBe('rejected');
    expect(next.candidates.find((c) => c.id === 'c3')?.status).toBe('pending');
  });

  it('SET_REVIEW_FILTER and SET_EDITING_CANDIDATE update their respective fields', () => {
    const filtered = wizardReducer(initialState, { type: 'SET_REVIEW_FILTER', filter: 'rejected' });
    expect(filtered.reviewFilter).toBe('rejected');

    const editing = wizardReducer(initialState, { type: 'SET_EDITING_CANDIDATE', id: 'c1' });
    expect(editing.editingCandidateId).toBe('c1');
  });

  it('INIT_ELEMENTS replaces the elements list wholesale', () => {
    const elements: ElementConfig[] = [
      { id: 'e1', name: 'a', displayName: 'a', kind: 'system', isExternal: false, tags: [] },
    ];
    const next = wizardReducer(initialState, { type: 'INIT_ELEMENTS', elements });
    expect(next.elements).toBe(elements);
  });

  it('UPDATE_ELEMENT replaces an existing element by id', () => {
    const existing: ElementConfig = {
      id: 'e1',
      name: 'a',
      displayName: 'a',
      kind: 'system',
      isExternal: false,
      tags: [],
    };
    const withElement: WizardState = { ...initialState, elements: [existing] };
    const updated: ElementConfig = { ...existing, displayName: 'A Renamed' };

    const next = wizardReducer(withElement, { type: 'UPDATE_ELEMENT', config: updated });

    expect(next.elements).toEqual([updated]);
  });

  it('UPDATE_ELEMENT appends when the element id is not already present', () => {
    const newElement: ElementConfig = {
      id: 'e2',
      name: 'b',
      displayName: 'b',
      kind: 'system',
      isExternal: false,
      tags: [],
    };

    const next = wizardReducer(initialState, { type: 'UPDATE_ELEMENT', config: newElement });

    expect(next.elements).toEqual([newElement]);
  });

  it('SELECT_ELEMENT sets and clears the selected element id', () => {
    const selected = wizardReducer(initialState, { type: 'SELECT_ELEMENT', id: 'e1' });
    expect(selected.selectedElementId).toBe('e1');

    const cleared = wizardReducer(selected, { type: 'SELECT_ELEMENT', id: null });
    expect(cleared.selectedElementId).toBeNull();
  });
});
