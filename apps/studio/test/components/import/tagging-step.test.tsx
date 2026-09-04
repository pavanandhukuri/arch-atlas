import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// TaggingStep renders DiagramPreview -> DiagramViewer -> MapCanvas, which tries to
// create a real PixiJS/WebGL renderer — unavailable in jsdom. Same mock diagram-preview
// .test.tsx already uses.
vi.mock('@arch-atlas/viewer-components', () => ({
  DiagramViewer: vi.fn(() => <div data-testid="diagram-viewer" />),
}));

import { TaggingStep } from '../../../src/components/import/tagging-step';
import type { ElementConfig, WizardState } from '../../../src/lib/import/types';

function element(overrides: Partial<ElementConfig> = {}): ElementConfig {
  return {
    id: overrides.id ?? 'el-1',
    name: 'orders-service',
    displayName: overrides.displayName ?? 'Orders Service',
    kind: 'container',
    containerSubtype: 'backend-service',
    isExternal: false,
    tags: [],
    ...overrides,
  };
}

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    step: 4,
    reviewFile: null,
    parseError: null,
    baseDiagramError: null,
    candidates: [],
    systems: [{ id: 'sys-1', name: 'Orders System', repoNames: [] }],
    elements: [],
    selectedElementId: null,
    reviewFilter: 'all',
    editingCandidateId: null,
    elementFilter: 'all',
    ...overrides,
  };
}

describe('TaggingStep', () => {
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatch = vi.fn();
  });

  it('shows the empty-elements message when there are none', () => {
    render(<TaggingStep state={baseState()} dispatch={dispatch} />);
    expect(screen.getByText('No elements detected yet.')).toBeDefined();
  });

  it('renders filter tab counts', () => {
    const state = baseState({
      elements: [
        element({ id: 'a', reviewed: false }),
        element({ id: 'b', reviewed: true }),
        element({ id: 'c', reviewed: false }),
      ],
    });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    expect(screen.getByRole('tab', { name: /^All/ }).textContent).toContain('3');
    expect(screen.getByRole('tab', { name: /^Pending/ }).textContent).toContain('2');
    expect(screen.getByRole('tab', { name: /^Reviewed/ }).textContent).toContain('1');
  });

  it('dispatches SET_ELEMENT_FILTER when a filter tab is clicked', async () => {
    render(<TaggingStep state={baseState({ elements: [element()] })} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Reviewed/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ELEMENT_FILTER', filter: 'reviewed' });
  });

  it('dispatches ACCEPT_ALL_ELEMENTS when "Accept All" is clicked', async () => {
    render(<TaggingStep state={baseState({ elements: [element()] })} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept All' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'ACCEPT_ALL_ELEMENTS' });
  });

  it('the "pending" filter shows only unreviewed elements', () => {
    const state = baseState({
      elements: [
        element({ id: 'a', displayName: 'Pending One', reviewed: false }),
        element({ id: 'b', displayName: 'Reviewed One', reviewed: true }),
      ],
      elementFilter: 'pending',
    });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    expect(screen.getByText('Pending One')).toBeDefined();
    expect(screen.queryByText('Reviewed One')).toBeNull();
  });

  it('shows the no-match message when a filter excludes every element', () => {
    const state = baseState({
      elements: [element({ reviewed: false })],
      elementFilter: 'reviewed',
    });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    expect(screen.getByText('No elements match the current filter.')).toBeDefined();
  });

  it('groups elements by kind in container/system/person order', () => {
    const state = baseState({
      elements: [
        element({ id: 'p', kind: 'person', displayName: 'A Person' }),
        element({ id: 's', kind: 'system', displayName: 'A System' }),
        element({ id: 'c', kind: 'container', displayName: 'A Container' }),
      ],
    });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    const headings = Array.from(document.querySelectorAll('.iw-candidate-group-label')).map(
      (h) => h.textContent
    );
    expect(headings).toEqual(['Containers', 'Systems', 'People']);
  });

  it("routes an element card's onAccept through SET_ELEMENT_REVIEWED, flipping the current value", async () => {
    const state = baseState({
      elements: [element({ id: 'a', isExternal: undefined, systemId: 'sys-1', reviewed: false })],
    });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept classification' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ELEMENT_REVIEWED',
      id: 'a',
      reviewed: true,
    });
  });

  it("routes an element card's onToggleEdit through SELECT_ELEMENT, toggling to null when already selected", async () => {
    const state = baseState({
      elements: [element({ id: 'a' })],
      selectedElementId: 'a',
    });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_ELEMENT', id: null });
  });

  it('shows the bulk action bar once an element is selected, and clears it via "Clear selection"', async () => {
    const state = baseState({ elements: [element({ id: 'a' })] });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: /select orders service/i }));
    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeDefined();
    expect(screen.getByText('1 selected')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('"select all visible" selects every visible element, and toggles back off', async () => {
    const state = baseState({ elements: [element({ id: 'a' }), element({ id: 'b' })] });
    render(<TaggingStep state={state} dispatch={dispatch} />);

    const selectAll = screen.getByRole('checkbox', { name: 'Select all visible elements' });
    await userEvent.click(selectAll);
    expect(screen.getByText('2 selected')).toBeDefined();

    await userEvent.click(selectAll);
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('bulk-assigns the selection to an existing system and clears selection afterward', async () => {
    const state = baseState({ elements: [element({ id: 'a' })] });
    render(<TaggingStep state={state} dispatch={dispatch} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /select orders service/i }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Assign selected containers to a system' }),
      'sys-1'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'BULK_ASSIGN_SYSTEM',
      ids: ['a'],
      systemId: 'sys-1',
    });
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('does not dispatch a bulk assign while no system is chosen', async () => {
    const state = baseState({ elements: [element({ id: 'a' })] });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /select orders service/i }));
    expect(screen.getByRole('button', { name: 'Assign' })).toHaveProperty('disabled', true);
  });

  it('creates a new system and bulk-assigns it via the "+ New system…" flow', async () => {
    const state = baseState({ elements: [element({ id: 'a' })] });
    render(<TaggingStep state={state} dispatch={dispatch} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /select orders service/i }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Assign selected containers to a system' }),
      '__new__'
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'New system name' }), 'New System');
    await userEvent.click(screen.getByRole('button', { name: 'Create & Assign' }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CREATE_SYSTEM', name: 'New System' })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BULK_ASSIGN_SYSTEM', ids: ['a'] })
    );
  });

  it('bulk-marks the selection as external', async () => {
    const state = baseState({ elements: [element({ id: 'a' })] });
    render(<TaggingStep state={state} dispatch={dispatch} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /select orders service/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark as External System' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'BULK_MARK_EXTERNAL', ids: ['a'] });
  });
});
