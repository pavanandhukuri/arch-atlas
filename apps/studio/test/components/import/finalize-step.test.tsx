import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('../../../src/components/import/diagram-preview', () => ({
  DiagramPreview: vi.fn(() => <div data-testid="diagram-preview" />),
}));

const exportModelMock = vi.fn();
vi.mock('../../../src/services/import-export', () => ({
  exportModel: (...args: unknown[]) => exportModelMock(...args),
}));

import { FinalizeStep } from '../../../src/components/import/finalize-step';
import type { WizardState, Candidate } from '../../../src/lib/import/types';
import type { ArchitectureModel } from '@arch-atlas/core-model';

const baseState: WizardState = {
  step: 5,
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
    status: 'accepted',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

describe('FinalizeStep', () => {
  it('shows element, connection, and system summary counts', () => {
    // 'a' is assigned to the one SystemGroup, so buildModel creates exactly
    // one system-kind element ('Core') — no dangling ungrouped-repo systems.
    const state: WizardState = {
      ...baseState,
      reviewFile: {
        version: '1.0',
        generated_at: '',
        source_repos: ['a'],
        systems: [],
        candidates: [],
      },
      systems: [{ id: 's1', name: 'Core', repoNames: ['a'] }],
      elements: [
        {
          id: 'svc',
          name: 'svc',
          displayName: 'svc',
          kind: 'container',
          isExternal: false,
          tags: [],
          systemId: 's1',
        },
      ],
      candidates: [candidate({ id: 'c1' })],
    };
    render(<FinalizeStep state={state} baseDiagram={null} onOpenInStudio={vi.fn()} />);

    expect(screen.getByText('Elements').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Connections').previousElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Systems').previousElementSibling?.textContent).toBe('1');
  });

  it('counts system-kind elements of the built model for the system count', () => {
    // No explicit SystemGroups and no elements — buildModel falls back to one
    // system element per ungrouped source repo (2 here: 'a' and 'b').
    render(<FinalizeStep state={baseState} baseDiagram={null} onOpenInStudio={vi.fn()} />);

    const systemStat = screen.getByText('Systems').previousElementSibling;
    expect(systemStat?.textContent).toBe('2');
  });

  it('calls exportModel with the built model when Download is clicked', async () => {
    const user = userEvent.setup();
    render(<FinalizeStep state={baseState} baseDiagram={null} onOpenInStudio={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Download .arch.json' }));

    expect(exportModelMock).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenInStudio with the built model when Open in Studio is clicked', async () => {
    const user = userEvent.setup();
    const onOpenInStudio = vi.fn();
    render(<FinalizeStep state={baseState} baseDiagram={null} onOpenInStudio={onOpenInStudio} />);

    await user.click(screen.getByRole('button', { name: 'Open in Studio' }));

    expect(onOpenInStudio).toHaveBeenCalledTimes(1);
    const passedModel = onOpenInStudio.mock.calls[0]?.[0] as ArchitectureModel;
    expect(passedModel.metadata.title).toBe('Imported Architecture');
  });

  it('merges into the base diagram when one is provided', async () => {
    const user = userEvent.setup();
    const onOpenInStudio = vi.fn();
    const baseDiagram: ArchitectureModel = {
      schemaVersion: '1.0.0',
      metadata: { title: 'Existing' },
      elements: [{ id: 'existing', kind: 'system', name: 'Existing' }],
      relationships: [],
      constraints: [],
      views: [],
    };

    render(
      <FinalizeStep state={baseState} baseDiagram={baseDiagram} onOpenInStudio={onOpenInStudio} />
    );
    await user.click(screen.getByRole('button', { name: 'Open in Studio' }));

    const passedModel = onOpenInStudio.mock.calls[0]?.[0] as ArchitectureModel;
    expect(passedModel.elements.some((e) => e.id === 'existing')).toBe(true);
  });
});
