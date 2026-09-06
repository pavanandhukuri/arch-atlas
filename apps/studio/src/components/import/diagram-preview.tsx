'use client';

import { useEffect, useMemo, useState } from 'react';
import { DiagramViewer } from '@archatlas/viewer-components';
import { computeLayout } from '@archatlas/layout';
import type { ArchitectureModel, View } from '@archatlas/core-model';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiagramPreviewProps {
  model: ArchitectureModel | null;
  placeholder?: string;
  className?: string;
  /** Heading shown in the maximized overlay's header bar. */
  title?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the View to hand to DiagramViewer. Prefers the model's own
 * views[0] (build-model.ts already lays out every element there, the same
 * way studio-page.tsx does), so the preview renders identically to what
 * "Open in Studio" / "Download .arch.json" will produce and we don't
 * recompute the same grid layout twice. Falls back to a self-computed
 * layout for models that don't carry a pre-built view.
 * Returns null when the model is empty or absent.
 */
function resolvePreviewView(model: ArchitectureModel): View | null {
  if (model.elements.length === 0) {
    return null;
  }

  const existingView = model.views[0];
  if (existingView && existingView.layout.nodes.length > 0) {
    return existingView;
  }

  // computeLayout ignores the `_view` parameter (underscore prefix), so we
  // pass a minimal placeholder just to satisfy the type signature.
  const placeholderView: View = {
    id: 'import-preview-placeholder',
    level: 'system',
    title: 'Import Preview',
    layout: {
      algorithm: 'grid',
      nodes: [],
      edges: [],
    },
  };

  // Lay out every element (systems, containers, people) in one shot, exactly
  // like the main Studio app does (see studio-page.tsx). DiagramViewer derives
  // which nodes are visible at a given drill level dynamically via parentId,
  // so the underlying view must already contain node positions for every
  // level — laying out only system-kind elements here left containers with
  // no computed position, so drilling into a system rendered nothing.
  const layout = computeLayout(model, placeholderView, {
    algorithm: 'grid',
    spacing: 200,
    padding: 80,
  });

  return {
    id: 'import-preview',
    level: 'system',
    title: 'Import Preview',
    layout,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiagramPreview({
  model,
  placeholder = 'Accept some candidates to see a preview diagram.',
  className,
  title = 'Live Preview',
}: DiagramPreviewProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  // Memoize the view so it is only recomputed when the model changes.
  const view = useMemo<View | null>(() => {
    if (model === null) return null;
    return resolvePreviewView(model);
  }, [model]);

  // Escape closes the maximized overlay, same as any modal/lightbox.
  useEffect(() => {
    if (!isMaximized) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMaximized(false);
    };
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [isMaximized]);

  const isEmpty = model === null || model.elements.length === 0;

  // Show a placeholder when there is nothing to render.
  if (isEmpty) {
    return (
      <div className={['iw-preview-placeholder', className].filter(Boolean).join(' ')}>
        <span>{placeholder}</span>
      </div>
    );
  }

  // DiagramViewer handles its own loading / error / empty states internally,
  // so we only reach here when we have a non-empty model and a computed view.
  const diagram = <DiagramViewer model={model} view={view} />;

  if (isMaximized) {
    return (
      <div className="iw-preview-overlay">
        <div className="iw-preview-overlay-header">
          <span>{title}</span>
          <button
            type="button"
            className="iw-preview-maximize-btn"
            onClick={() => setIsMaximized(false)}
            aria-label="Minimize preview"
            title="Minimize"
          >
            ✕
          </button>
        </div>
        <div className="iw-preview-overlay-body">{diagram}</div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <button
        type="button"
        className="iw-preview-maximize-btn iw-preview-maximize-btn--floating"
        onClick={() => setIsMaximized(true)}
        aria-label="Maximize preview"
        title="Maximize"
      >
        ⛶
      </button>
      {diagram}
    </div>
  );
}
