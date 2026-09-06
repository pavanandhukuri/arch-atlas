import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ArchitectureModel, View } from '@archatlas/core-model';

// Mock MapCanvas so tests don't need a real PixiJS canvas
vi.mock('../../../../packages/viewer-components/src/components/map-canvas', () => ({
  MapCanvas: vi.fn(({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="map-canvas" data-readonly={String(readOnly)} />
  )),
}));

import { DiagramViewer } from '@archatlas/viewer-components';
import { MapCanvas } from '../../../../packages/viewer-components/src/components/map-canvas';

const EMPTY_VIEW: View = {
  id: 'main',
  level: 'landscape',
  title: 'Main',
  layout: { algorithm: 'grid', nodes: [], edges: [] },
};

const MODEL_WITH_ELEMENTS: ArchitectureModel = {
  schemaVersion: '1.0.0',
  metadata: { title: 'Test' },
  elements: [{ id: 'a', kind: 'system', name: 'Alpha' }],
  relationships: [],
  constraints: [],
  views: [EMPTY_VIEW],
};

const EMPTY_MODEL: ArchitectureModel = {
  schemaVersion: '1.0.0',
  metadata: { title: 'Empty' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
};

describe('DiagramViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders MapCanvas when model and view are provided', () => {
    render(<DiagramViewer model={MODEL_WITH_ELEMENTS} view={EMPTY_VIEW} />);
    expect(screen.getByTestId('map-canvas')).toBeDefined();
  });

  it('renders MapCanvas with readOnly={true}', () => {
    render(<DiagramViewer model={MODEL_WITH_ELEMENTS} view={EMPTY_VIEW} />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas.getAttribute('data-readonly')).toBe('true');
  });

  it('renders empty-state message when model has no elements', () => {
    render(<DiagramViewer model={EMPTY_MODEL} view={EMPTY_VIEW} />);
    expect(screen.getByText(/no elements/i)).toBeDefined();
    expect(screen.queryByTestId('map-canvas')).toBeNull();
  });

  it('renders loading indicator when isLoading is true', () => {
    render(<DiagramViewer model={null} view={null} isLoading />);
    expect(screen.getByTestId('diagram-viewer-loading')).toBeDefined();
    expect(screen.queryByTestId('map-canvas')).toBeNull();
  });

  it('renders error message when error is provided', () => {
    render(<DiagramViewer model={null} view={null} error="Could not load diagram." />);
    expect(screen.getByText('Could not load diagram.')).toBeDefined();
    expect(screen.queryByTestId('map-canvas')).toBeNull();
  });

  it('passes readOnly={true} to MapCanvas (T006)', () => {
    render(<DiagramViewer model={MODEL_WITH_ELEMENTS} view={EMPTY_VIEW} />);
    const MockMapCanvas = MapCanvas as ReturnType<typeof vi.fn>;
    const lastCall = MockMapCanvas.mock.calls[MockMapCanvas.mock.calls.length - 1];
    expect(lastCall?.[0]?.readOnly).toBe(true);
  });
});
