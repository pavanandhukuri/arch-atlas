'use client';

import { useMemo } from 'react';
import { DiagramViewer } from '@arch-atlas/viewer-components';
import { computeLayout } from '@arch-atlas/layout';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiagramPreviewProps {
  model: ArchitectureModel | null;
  placeholder?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a View from an ArchitectureModel using a simple grid layout.
 * Returns null when the model is empty or absent.
 */
function buildPreviewView(model: ArchitectureModel): View | null {
  if (model.elements.length === 0) {
    return null;
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
}: DiagramPreviewProps) {
  // Memoize the view so it is only recomputed when the model changes.
  const view = useMemo<View | null>(() => {
    if (model === null) return null;
    return buildPreviewView(model);
  }, [model]);

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
  return (
    <div
      className={className}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <DiagramViewer model={model} view={view} />
    </div>
  );
}
