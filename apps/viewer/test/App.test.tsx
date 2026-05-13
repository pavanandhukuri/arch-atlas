import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { ArchitectureModel } from '@arch-atlas/core-model';

vi.mock('../../../packages/viewer-components/src/components/map-canvas', () => ({
  MapCanvas: vi.fn(() => <div data-testid="map-canvas" />),
}));

import { App } from '../src/App';

const MANIFEST = [{ id: 'demo', title: 'Demo Diagram', file: 'demo.arch.json' }];

const MODEL: ArchitectureModel = {
  schemaVersion: '1.0.0',
  metadata: { title: 'Demo' },
  elements: [{ id: 'a', kind: 'system', name: 'Alpha' }],
  relationships: [],
  constraints: [],
  views: [
    {
      id: 'v1',
      level: 'landscape',
      title: 'Main',
      layout: { algorithm: 'grid', nodes: [], edges: [] },
    },
  ],
};

function mockFetch(manifestOk: boolean, modelOk: boolean, modelData: unknown = MODEL) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('manifest.json')) {
      return Promise.resolve({
        ok: manifestOk,
        json: () => Promise.resolve(MANIFEST),
      });
    }
    return Promise.resolve({
      ok: modelOk,
      text: () => Promise.resolve(JSON.stringify(modelData)),
    });
  }) as unknown as typeof fetch;
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows picker after manifest loads', async () => {
    mockFetch(true, true);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Demo Diagram')).toBeDefined());
  });

  it('selecting a diagram renders DiagramViewer', async () => {
    mockFetch(true, true);
    render(<App />);
    await waitFor(() => screen.getByText('Demo Diagram'));
    await userEvent.click(screen.getByText('Demo Diagram'));
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeDefined());
  });

  it('shows error state when model JSON is malformed', async () => {
    mockFetch(true, true, 'not valid json {{');
    render(<App />);
    await waitFor(() => screen.getByText('Demo Diagram'));
    await userEvent.click(screen.getByText('Demo Diagram'));
    await waitFor(() => expect(screen.getByTestId('diagram-viewer-error')).toBeDefined());
  });

  it('shows back button after a diagram is selected', async () => {
    mockFetch(true, true);
    render(<App />);
    await waitFor(() => screen.getByText('Demo Diagram'));
    await userEvent.click(screen.getByText('Demo Diagram'));
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeDefined());
  });
});
