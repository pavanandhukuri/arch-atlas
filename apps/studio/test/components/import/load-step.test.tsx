import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { LoadStep } from '../../../src/components/import/load-step';
import type { WizardState } from '../../../src/lib/import/types';

const baseState: WizardState = {
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

const VALID_REVIEW_YAML = `
version: '1.0'
generated_at: '2026-08-01T00:00:00.000Z'
source_repos: [user-service, notification-service]
candidates:
  - id: cand_1
    source: user-service
    target: notification-service
    type: http
    reasoning: 'calls it'
    confidence: high
`;

const VALID_ARCH_JSON = JSON.stringify({
  schemaVersion: '1.0.0',
  metadata: { title: 'Base' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
});

describe('LoadStep', () => {
  it('dispatches LOAD_REVIEW when a well-formed review.yaml is uploaded', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <LoadStep
        state={baseState}
        dispatch={dispatch}
        baseDiagram={null}
        onBaseDiagramLoad={vi.fn()}
      />
    );

    const file = new File([VALID_REVIEW_YAML], 'architecture.review.yaml', { type: 'text/yaml' });
    const input = document.querySelector('input[accept=".yaml,.yml"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOAD_REVIEW' }))
    );
  });

  it('dispatches SET_PARSE_ERROR when the uploaded review file is invalid', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <LoadStep
        state={baseState}
        dispatch={dispatch}
        baseDiagram={null}
        onBaseDiagramLoad={vi.fn()}
      />
    );

    const file = new File(['not: [valid'], 'bad.yaml', { type: 'text/yaml' });
    const input = document.querySelector('input[accept=".yaml,.yml"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_PARSE_ERROR' }))
    );
  });

  it('shows the parse error message when state.parseError is set', () => {
    render(
      <LoadStep
        state={{ ...baseState, parseError: 'Missing or invalid "version" field' }}
        dispatch={vi.fn()}
        baseDiagram={null}
        onBaseDiagramLoad={vi.fn()}
      />
    );
    expect(screen.getByText('Missing or invalid "version" field')).toBeDefined();
  });

  it('shows repo and candidate counts once a review file is loaded', () => {
    render(
      <LoadStep
        state={{
          ...baseState,
          reviewFile: {
            version: '1.0',
            generated_at: '',
            source_repos: ['a', 'b'],
            candidates: [],
          },
          candidates: [
            {
              id: 'c1',
              source: 'a',
              target: 'b',
              type: 'http',
              reasoning: 'x',
              confidence: 'high',
              status: 'pending',
              override_name: null,
              override_type: null,
            },
          ],
        }}
        dispatch={vi.fn()}
        baseDiagram={null}
        onBaseDiagramLoad={vi.fn()}
      />
    );
    expect(screen.getByText('2 repos · 1 candidate')).toBeDefined();
  });

  it('loads a base diagram and calls onBaseDiagramLoad when a valid arch.json is uploaded', async () => {
    const user = userEvent.setup();
    const onBaseDiagramLoad = vi.fn();
    render(
      <LoadStep
        state={baseState}
        dispatch={vi.fn()}
        baseDiagram={null}
        onBaseDiagramLoad={onBaseDiagramLoad}
      />
    );

    const file = new File([VALID_ARCH_JSON], 'architecture.arch.json', {
      type: 'application/json',
    });
    const input = document.querySelector('input[accept=".json"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(onBaseDiagramLoad).toHaveBeenCalled());
    expect(onBaseDiagramLoad.mock.calls[0]?.[0]).toMatchObject({ metadata: { title: 'Base' } });
  });

  it('dispatches SET_BASE_DIAGRAM_ERROR and clears the base diagram when arch.json is invalid', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const onBaseDiagramLoad = vi.fn();
    render(
      <LoadStep
        state={baseState}
        dispatch={dispatch}
        baseDiagram={null}
        onBaseDiagramLoad={onBaseDiagramLoad}
      />
    );

    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[accept=".json"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_BASE_DIAGRAM_ERROR' })
      )
    );
    expect(onBaseDiagramLoad).toHaveBeenCalledWith(null);
  });

  it('shows the base diagram error message when set', () => {
    render(
      <LoadStep
        state={{ ...baseState, baseDiagramError: 'Invalid JSON' }}
        dispatch={vi.fn()}
        baseDiagram={null}
        onBaseDiagramLoad={vi.fn()}
      />
    );
    expect(screen.getByText('Invalid JSON')).toBeDefined();
  });
});
