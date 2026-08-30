import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CandidateCard } from '../../../src/components/import/candidate-card';
import type { Candidate } from '../../../src/lib/import/types';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1',
    source: 'user-service',
    target: 'notification-service',
    type: 'http',
    reasoning: 'user-service calls notification-service',
    confidence: 'high',
    status: 'pending',
    override_name: null,
    override_type: null,
    ...overrides,
  };
}

function renderCard(overrides: Partial<Candidate> = {}, extraProps: Record<string, unknown> = {}) {
  const onAccept = vi.fn();
  const onReject = vi.fn();
  const onToggleEdit = vi.fn();
  const onSaveEdit = vi.fn();
  const onCancelEdit = vi.fn();
  render(
    <CandidateCard
      candidate={makeCandidate(overrides)}
      isEditing={false}
      onAccept={onAccept}
      onReject={onReject}
      onToggleEdit={onToggleEdit}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
      {...extraProps}
    />
  );
  return { onAccept, onReject, onToggleEdit, onSaveEdit, onCancelEdit };
}

describe('CandidateCard', () => {
  it('renders the source and target names', () => {
    renderCard();
    expect(screen.getByText('user-service')).toBeDefined();
    expect(screen.getByText('notification-service')).toBeDefined();
  });

  it('shows the override name instead of the target when set, with the original in parentheses', () => {
    renderCard({ override_name: 'Notifications API' });
    expect(screen.getByText('Notifications API')).toBeDefined();
    expect(screen.getByText('(notification-service)')).toBeDefined();
  });

  it('calls onAccept when the accept button is clicked', async () => {
    const user = userEvent.setup();
    const { onAccept } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Accept candidate' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onReject when the reject button is clicked', async () => {
    const user = userEvent.setup();
    const { onReject } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Reject candidate' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleEdit when the edit button is clicked', async () => {
    const user = userEvent.setup();
    const { onToggleEdit } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Edit override name' }));
    expect(onToggleEdit).toHaveBeenCalledTimes(1);
  });

  it('reflects accepted status in the accept button label and aria-pressed', () => {
    renderCard({ status: 'accepted' });
    const btn = screen.getByRole('button', { name: 'Accepted — click to set pending' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('reflects rejected status in the reject button label and aria-pressed', () => {
    renderCard({ status: 'rejected' });
    const btn = screen.getByRole('button', { name: 'Rejected — click to set pending' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the edit form with the current override name when isEditing is true', () => {
    renderCard({ override_name: 'Custom Name' }, { isEditing: true });
    const input = screen.getByLabelText('Override name') as HTMLInputElement;
    expect(input.value).toBe('Custom Name');
  });

  it('calls onSaveEdit with the trimmed name and preserves override_type on Save click', async () => {
    const user = userEvent.setup();
    const { onSaveEdit } = renderCard({ override_type: 'REST' }, { isEditing: true });

    const input = screen.getByLabelText('Override name');
    await user.clear(input);
    await user.type(input, '  Billing Service  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSaveEdit).toHaveBeenCalledWith('Billing Service', 'REST');
  });

  it('calls onSaveEdit with null when the trimmed name is empty', async () => {
    const user = userEvent.setup();
    const { onSaveEdit } = renderCard({ override_name: 'Old' }, { isEditing: true });

    const input = screen.getByLabelText('Override name');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSaveEdit).toHaveBeenCalledWith(null, null);
  });

  it('saves on Enter and cancels on Escape from the edit input', async () => {
    const user = userEvent.setup();
    const { onSaveEdit, onCancelEdit } = renderCard({}, { isEditing: true });

    const input = screen.getByLabelText('Override name');
    await user.type(input, 'Enter Save{Enter}');
    expect(onSaveEdit).toHaveBeenCalledTimes(1);

    await user.type(input, '{Escape}');
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onCancelEdit when the Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onCancelEdit } = renderCard({}, { isEditing: true });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });
});
