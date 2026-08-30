import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('../../../src/components/import/diagram-preview', () => ({
  DiagramPreview: vi.fn(() => <div data-testid="diagram-preview" />),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { ReviewStep } from '../../../src/components/import/review-step';
import { DiagramPreview } from '../../../src/components/import/diagram-preview';
import type { WizardState, Candidate } from '../../../src/lib/import/types';

const baseState: WizardState = {
  step: 3,
  reviewFile: {
    version: '1.0',
    generated_at: '',
    source_repos: ['a', 'b'],
    systems: [],
    candidates: [],
  },
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

function candidate(overrides: Partial<Candidate> & Pick<Candidate, 'id'>): Candidate {
  return {
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

describe('ReviewStep', () => {
  it('shows "No candidates match the current filter." with no candidates', () => {
    render(<ReviewStep state={baseState} dispatch={vi.fn()} />);
    expect(screen.getByText('No candidates match the current filter.')).toBeDefined();
  });

  it('groups candidates by source repo', () => {
    const state: WizardState = {
      ...baseState,
      candidates: [
        candidate({ id: 'c1', source: 'a', target: 'b' }),
        candidate({ id: 'c2', source: 'a', target: 'c' }),
      ],
    };
    render(<ReviewStep state={state} dispatch={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'a', level: 3 })).toBeDefined();
  });

  it('always renders the diagram preview, passing a placeholder for the empty-model case', () => {
    render(<ReviewStep state={baseState} dispatch={vi.fn()} />);
    expect(screen.getByTestId('diagram-preview')).toBeDefined();
    expect(vi.mocked(DiagramPreview).mock.calls[0]?.[0]).toMatchObject({
      placeholder: 'Classify elements to see the diagram',
    });
  });

  it('rebuilds the preview model to include an accepted candidate', () => {
    const state: WizardState = {
      ...baseState,
      candidates: [candidate({ id: 'c1', status: 'accepted' })],
    };
    render(<ReviewStep state={state} dispatch={vi.fn()} />);

    const passedModel = vi.mocked(DiagramPreview).mock.calls[0]?.[0].model;
    expect(passedModel?.relationships).toHaveLength(1);
  });

  it('dispatches ACCEPT_ALL_HIGH_CONFIDENCE when the toolbar button is clicked', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<ReviewStep state={baseState} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: 'Accept All High' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ACCEPT_ALL_HIGH_CONFIDENCE' });
  });

  it('dispatches SET_REVIEW_FILTER when a filter tab is clicked', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<ReviewStep state={baseState} dispatch={dispatch} />);

    await user.click(screen.getByRole('tab', { name: /Accepted/ }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_REVIEW_FILTER', filter: 'accepted' });
  });

  it('only shows candidates matching the active filter', () => {
    const state: WizardState = {
      ...baseState,
      reviewFilter: 'accepted',
      candidates: [
        candidate({ id: 'c1', source: 'accepted-source', status: 'accepted' }),
        candidate({ id: 'c2', source: 'pending-source', status: 'pending' }),
      ],
    };
    render(<ReviewStep state={state} dispatch={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'accepted-source', level: 3 })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'pending-source', level: 3 })).toBeNull();
  });

  it('shows per-status counts on the filter tabs', () => {
    const state: WizardState = {
      ...baseState,
      candidates: [
        candidate({ id: 'c1', status: 'accepted' }),
        candidate({ id: 'c2', status: 'accepted' }),
        candidate({ id: 'c3', status: 'rejected' }),
      ],
    };
    render(<ReviewStep state={state} dispatch={vi.fn()} />);

    const acceptedTab = screen.getByRole('tab', { name: /Accepted/ });
    expect(acceptedTab.textContent).toContain('2');
  });

  it('dispatches SET_CANDIDATE_STATUS via the candidate card accept button', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const state: WizardState = { ...baseState, candidates: [candidate({ id: 'c1' })] };
    render(<ReviewStep state={state} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: 'Accept candidate' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_CANDIDATE_STATUS',
      id: 'c1',
      status: 'accepted',
    });
  });
});
