import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TaggingStep } from '../../../src/components/import/tagging-step';
import type { WizardState, Candidate, ElementConfig } from '../../../src/lib/import/types';

const baseState: WizardState = {
  step: 4,
  reviewFile: {
    version: '1.0',
    generated_at: '',
    source_repos: ['user-service', 'notification-service'],
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
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1',
    source: 'user-service',
    target: 'notification-service',
    type: 'http',
    reasoning: 'x',
    confidence: 'high',
    status: 'pending',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

describe('TaggingStep', () => {
  it('shows "No elements detected yet." when there are no candidates', () => {
    render(<TaggingStep state={baseState} dispatch={vi.fn()} />);
    expect(screen.getByText('No elements detected yet.')).toBeDefined();
  });

  it('dispatches INIT_ELEMENTS derived from candidates when elements are empty', () => {
    const dispatch = vi.fn();
    const state: WizardState = { ...baseState, candidates: [candidate()] };

    render(<TaggingStep state={state} dispatch={dispatch} />);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'INIT_ELEMENTS' }));
  });

  it('does not re-dispatch INIT_ELEMENTS once elements already exist', () => {
    const dispatch = vi.fn();
    const elements: ElementConfig[] = [
      {
        id: 'user-service',
        name: 'user-service',
        displayName: 'user-service',
        kind: 'container',
        isExternal: false,
        tags: [],
      },
    ];
    const state: WizardState = { ...baseState, candidates: [candidate()], elements };

    render(<TaggingStep state={state} dispatch={dispatch} />);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shows the editor placeholder until an element is selected', () => {
    const elements: ElementConfig[] = [
      { id: 'e1', name: 'a', displayName: 'a', kind: 'system', isExternal: false, tags: [] },
    ];
    render(<TaggingStep state={{ ...baseState, elements }} dispatch={vi.fn()} />);
    expect(screen.getByText('← Select an element to classify it')).toBeDefined();
  });

  it('dispatches SELECT_ELEMENT when an element in the list is clicked', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const elements: ElementConfig[] = [
      {
        id: 'e1',
        name: 'a',
        displayName: 'user-service',
        kind: 'container',
        isExternal: false,
        tags: [],
      },
    ];
    render(<TaggingStep state={{ ...baseState, elements }} dispatch={dispatch} />);

    await user.click(screen.getByText('user-service'));

    expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_ELEMENT', id: 'e1' });
  });

  it('renders the editor panel once an element is selected', () => {
    const elements: ElementConfig[] = [
      {
        id: 'e1',
        name: 'a',
        displayName: 'user-service',
        kind: 'container',
        isExternal: false,
        tags: [],
      },
    ];
    render(
      <TaggingStep state={{ ...baseState, elements, selectedElementId: 'e1' }} dispatch={vi.fn()} />
    );
    expect(screen.getByText('a')).toBeDefined(); // editor title = canonical name
  });

  it('marks the selected element with the external badge when applicable', () => {
    const elements: ElementConfig[] = [
      {
        id: 'e1',
        name: 'stripe',
        displayName: 'Stripe',
        kind: 'system',
        isExternal: true,
        tags: [],
      },
    ];
    render(<TaggingStep state={{ ...baseState, elements }} dispatch={vi.fn()} />);
    expect(screen.getByText('ext')).toBeDefined();
  });
});
