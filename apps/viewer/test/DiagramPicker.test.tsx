import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DiagramPicker } from '../src/components/DiagramPicker';
import type { DiagramManifestEntry } from '../src/components/DiagramPicker';

const ENTRIES: DiagramManifestEntry[] = [
  { id: 'system-overview', title: 'System Overview', file: 'system-overview.arch.json' },
  { id: 'data-pipeline', title: 'Data Pipeline', file: 'data-pipeline.arch.json' },
];

describe('DiagramPicker', () => {
  it('renders list of diagram titles', () => {
    render(<DiagramPicker manifest={ENTRIES} onSelect={vi.fn()} />);
    expect(screen.getByText('System Overview')).toBeDefined();
    expect(screen.getByText('Data Pipeline')).toBeDefined();
  });

  it('calls onSelect with the entry when a title is clicked', async () => {
    const onSelect = vi.fn();
    render(<DiagramPicker manifest={ENTRIES} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('System Overview'));
    expect(onSelect).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it('renders "No diagrams available" when manifest is empty', () => {
    render(<DiagramPicker manifest={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no diagrams available/i)).toBeDefined();
  });
});
