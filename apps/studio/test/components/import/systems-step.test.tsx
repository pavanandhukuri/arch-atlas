import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SystemsStep } from '../../../src/components/import/systems-step';
import type { WizardState } from '../../../src/lib/import/types';

const baseState: WizardState = {
  step: 2,
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

describe('SystemsStep', () => {
  it('lists every source repo as ungrouped when no systems exist', () => {
    render(<SystemsStep state={baseState} dispatch={vi.fn()} />);
    expect(screen.getByText('user-service')).toBeDefined();
    expect(screen.getByText('notification-service')).toBeDefined();
    expect(screen.getByText('No systems yet. Create one below.')).toBeDefined();
  });

  it('dispatches CREATE_SYSTEM with a generated id when Add is clicked', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SystemsStep state={baseState} dispatch={dispatch} />);

    await user.type(screen.getByLabelText('New system name'), 'Core Platform');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CREATE_SYSTEM', name: 'Core Platform' })
    );
  });

  it('does not dispatch CREATE_SYSTEM for a blank/whitespace-only name', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SystemsStep state={baseState} dispatch={dispatch} />);

    await user.type(screen.getByLabelText('New system name'), '   ');
    expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);
  });

  it('creates a system on Enter in the new-system input', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SystemsStep state={baseState} dispatch={dispatch} />);

    await user.type(screen.getByLabelText('New system name'), 'Core{Enter}');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CREATE_SYSTEM', name: 'Core' })
    );
  });

  it('shows an assignment dropdown for ungrouped repos once a system exists', () => {
    const state: WizardState = {
      ...baseState,
      systems: [{ id: 's1', name: 'Core', repoNames: [] }],
    };
    render(<SystemsStep state={state} dispatch={vi.fn()} />);
    expect(screen.getByLabelText('Assign user-service to system')).toBeDefined();
  });

  it('dispatches ASSIGN_REPO_TO_SYSTEM when a repo is assigned via the dropdown', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const state: WizardState = {
      ...baseState,
      systems: [{ id: 's1', name: 'Core', repoNames: [] }],
    };
    render(<SystemsStep state={state} dispatch={dispatch} />);

    await user.selectOptions(screen.getByLabelText('Assign user-service to system'), 's1');

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ASSIGN_REPO_TO_SYSTEM',
      repoName: 'user-service',
      systemId: 's1',
    });
  });

  it('renders assigned repos as tags with a remove button and dispatches UNASSIGN_REPO', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const state: WizardState = {
      ...baseState,
      systems: [{ id: 's1', name: 'Core', repoNames: ['user-service'] }],
    };
    render(<SystemsStep state={state} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: 'Remove user-service from Core' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'UNASSIGN_REPO', repoName: 'user-service' });
  });

  it('dispatches DELETE_SYSTEM when a system is deleted', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const state: WizardState = {
      ...baseState,
      systems: [{ id: 's1', name: 'Core', repoNames: [] }],
    };
    render(<SystemsStep state={state} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: 'Delete system Core' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_SYSTEM', systemId: 's1' });
  });

  it('shows "All repos are assigned to a system." once every repo is grouped', () => {
    const state: WizardState = {
      ...baseState,
      systems: [{ id: 's1', name: 'Core', repoNames: ['user-service', 'notification-service'] }],
    };
    render(<SystemsStep state={state} dispatch={vi.fn()} />);
    expect(screen.getByText('All repos are assigned to a system.')).toBeDefined();
  });
});
