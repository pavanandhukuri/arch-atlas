/**
 * Tests for ConflictResolutionDialog (T043)
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ConflictResolutionDialog } from '../../../src/components/storage/ConflictResolutionDialog';

const BASE_PROPS = {
  fileName: 'my-diagram.arch.json',
  localTimestamp: '2026-03-21T10:00:00.000Z',
  remoteTimestamp: '2026-03-21T11:00:00.000Z',
  onKeepMine: vi.fn(),
  onLoadRemote: vi.fn(),
};

describe('ConflictResolutionDialog', () => {
  it('renders the file name and both version labels', () => {
    render(<ConflictResolutionDialog {...BASE_PROPS} />);

    expect(screen.getByText(/my-diagram\.arch\.json/)).toBeDefined();
    expect(screen.getAllByText(/your version/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/remote version/i).length).toBeGreaterThan(0);
  });

  it('calls onKeepMine when "Keep My Version" is clicked', async () => {
    const onKeepMine = vi.fn();
    render(<ConflictResolutionDialog {...BASE_PROPS} onKeepMine={onKeepMine} />);

    await userEvent.click(screen.getByRole('button', { name: /keep my version/i }));

    expect(onKeepMine).toHaveBeenCalledTimes(1);
  });

  it('calls onLoadRemote when "Load Remote Version" is clicked', async () => {
    const onLoadRemote = vi.fn();
    render(<ConflictResolutionDialog {...BASE_PROPS} onLoadRemote={onLoadRemote} />);

    await userEvent.click(screen.getByRole('button', { name: /load remote version/i }));

    expect(onLoadRemote).toHaveBeenCalledTimes(1);
  });

  it('renders as a modal dialog that cannot be dismissed without choosing', () => {
    render(<ConflictResolutionDialog {...BASE_PROPS} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    // No close / dismiss button — user must choose one of the two actions
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });
});
