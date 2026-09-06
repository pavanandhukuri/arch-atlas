import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ArchitectureModel } from '@archatlas/core-model';

vi.mock('@archatlas/viewer-components', () => ({
  DiagramViewer: vi.fn(() => <div data-testid="diagram-viewer" />),
}));

import { DiagramPreview } from '../../../src/components/import/diagram-preview';
import { DiagramViewer } from '@archatlas/viewer-components';

function modelWith(elementCount: number): ArchitectureModel {
  return {
    schemaVersion: '1.0.0',
    metadata: { title: 'Test' },
    elements: Array.from({ length: elementCount }, (_, i) => ({
      id: `e${i}`,
      kind: 'system' as const,
      name: `Element ${i}`,
    })),
    relationships: [],
    constraints: [],
    views: [],
  };
}

describe('DiagramPreview', () => {
  it('shows the default placeholder when model is null', () => {
    render(<DiagramPreview model={null} />);
    expect(screen.getByText('Accept some candidates to see a preview diagram.')).toBeDefined();
  });

  it('shows a custom placeholder when provided', () => {
    render(<DiagramPreview model={null} placeholder="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeDefined();
  });

  it('shows the placeholder when the model has no elements', () => {
    render(<DiagramPreview model={modelWith(0)} />);
    expect(screen.getByText('Accept some candidates to see a preview diagram.')).toBeDefined();
  });

  it('renders the DiagramViewer when the model has elements', () => {
    render(<DiagramPreview model={modelWith(2)} />);
    expect(screen.getByTestId('diagram-viewer')).toBeDefined();
    expect(vi.mocked(DiagramViewer)).toHaveBeenCalledTimes(1);
  });
});
