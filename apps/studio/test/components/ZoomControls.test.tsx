import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ZoomControls } from '@archatlas/viewer-components';

describe('ZoomControls', () => {
  const onZoomIn = vi.fn();
  const onZoomOut = vi.fn();
  const onFitToView = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders zoom percentage label', () => {
    render(
      <ZoomControls
        zoomLevel={1.5}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    expect(screen.getByText('150%')).toBeDefined();
  });

  it('renders 100% when zoomLevel is 1.0', () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('clicking + button calls onZoomIn', async () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(onZoomIn).toHaveBeenCalledOnce();
  });

  it('clicking − button calls onZoomOut', async () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it('clicking fit-to-view button calls onFitToView', async () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /fit to view/i }));
    expect(onFitToView).toHaveBeenCalledOnce();
  });

  it('zoom-in button has aria-label "Zoom in"', () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDefined();
  });

  it('zoom-out button has aria-label "Zoom out"', () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDefined();
  });

  it('fit-to-view button has aria-label "Fit to view"', () => {
    render(
      <ZoomControls
        zoomLevel={1.0}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToView={onFitToView}
      />
    );
    expect(screen.getByRole('button', { name: 'Fit to view' })).toBeDefined();
  });
});
