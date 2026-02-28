'use client';

import { useEffect, useRef } from 'react';
import { createRenderer, type Renderer } from '@arch-atlas/renderer';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

interface MapCanvasProps {
  model: ArchitectureModel;
  view: View;
  onElementClick?: (elementId: string) => void;
  onElementDoubleClick?: (elementId: string) => void;
  onElementDrag?: (elementId: string, x: number, y: number) => void;
  onConnectionStart?: (elementId: string) => void;
  onRelationshipClick?: (relationshipId: string) => void;
  connectionStartId?: string | null;
  boundaryElementIds?: string[];
  externalElementIds?: string[];
  boundaryLabel?: string;
}

export function MapCanvas({
  model,
  view,
  onElementClick,
  onElementDoubleClick,
  onElementDrag,
  onConnectionStart,
  onRelationshipClick,
  connectionStartId,
  boundaryElementIds,
  externalElementIds,
  boundaryLabel,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Keep refs to the latest callbacks so we can use them in stable closures below.
  // This means we never need to re-register callbacks when handlers change.
  const onElementClickRef = useRef(onElementClick);
  const onElementDoubleClickRef = useRef(onElementDoubleClick);
  const onElementDragRef = useRef(onElementDrag);
  const onConnectionStartRef = useRef(onConnectionStart);
  const onRelationshipClickRef = useRef(onRelationshipClick);

  // Keep refs in sync on every render without triggering re-registration
  onElementClickRef.current = onElementClick;
  onElementDoubleClickRef.current = onElementDoubleClick;
  onElementDragRef.current = onElementDrag;
  onConnectionStartRef.current = onConnectionStart;
  onRelationshipClickRef.current = onRelationshipClick;

  // Create renderer once; register stable callback wrappers that delegate to refs.
  // This is intentionally run only on mount (empty deps) so callbacks are never
  // re-added to the renderer's internal arrays on re-renders.
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    const renderer = createRenderer(containerRef.current, model, view, {
      onElementDrag: (id, x, y) => onElementDragRef.current?.(id, x, y),
    });
    rendererRef.current = renderer;

    renderer.onClick((elementId) => {
      onElementClickRef.current?.(elementId);
    });

    renderer.onDrillDown((elementId) => {
      onElementDoubleClickRef.current?.(elementId);
    });

    renderer.onDrag((elementId, x, y) => {
      onElementDragRef.current?.(elementId, x, y);
    });

    renderer.onConnectionStart((elementId) => {
      onConnectionStartRef.current?.(elementId);
    });

    // Drag-to-connect completion: treat target element as a click so that
    // studio-page.tsx can detect connectionStartId and create the relationship.
    renderer.onConnectionComplete((sourceId, targetId) => {
      onElementClickRef.current?.(targetId);
    });

    renderer.onRelationshipClick((relationshipId) => {
      onRelationshipClickRef.current?.(relationshipId);
    });

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep connection preview in sync
  useEffect(() => {
    rendererRef.current?.setConnectionPreview(connectionStartId ?? null);
  }, [connectionStartId]);

  // Re-render canvas when model / view / boundary metadata changes
  useEffect(() => {
    rendererRef.current?.updateLayout(model, view, {
      boundaryElementIds: boundaryElementIds ?? [],
      externalElementIds: externalElementIds ?? [],
      boundaryLabel,
    });
  }, [model, view, boundaryElementIds, externalElementIds, boundaryLabel]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    />
  );
}
