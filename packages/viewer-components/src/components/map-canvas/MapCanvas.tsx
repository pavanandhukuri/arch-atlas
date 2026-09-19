import { useEffect, useRef } from 'react';
import { createRenderer, type Renderer } from '@archatlas/renderer';
import type { ArchitectureModel, View } from '@archatlas/core-model';

interface MapCanvasProps {
  model: ArchitectureModel;
  view: View;
  readOnly?: boolean;
  onElementClick?: (elementId: string) => void;
  onElementDoubleClick?: (elementId: string) => void;
  onElementDrag?: (elementId: string, x: number, y: number) => void;
  onConnectionStart?: (elementId: string) => void;
  onRelationshipClick?: (relationshipId: string) => void;
  onBackgroundClick?: () => void;
  onRendererMount?: (renderer: Renderer) => void;
  connectionStartId?: string | null;
  boundaryElementIds?: string[];
  externalElementIds?: string[];
  boundaryLabel?: string;
  /**
   * Frame all content in the canvas whenever this value changes (compared by
   * identity) — e.g. a different diagram was loaded, or the view drilled
   * into/out of a system. Unset = never auto-fit. Ordinary edits to the same
   * diagram must NOT change it, or the viewport would jump under the user.
   */
  fitKey?: unknown;
  /** Called with the applied zoom after an automatic fit, to sync a zoom display. */
  onViewportFit?: (zoom: number) => void;
}

export function MapCanvas({
  model,
  view,
  readOnly = false,
  onElementClick,
  onElementDoubleClick,
  onElementDrag,
  onConnectionStart,
  onRelationshipClick,
  onBackgroundClick,
  onRendererMount,
  connectionStartId,
  boundaryElementIds,
  externalElementIds,
  boundaryLabel,
  fitKey,
  onViewportFit,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const lastFitKeyRef = useRef<unknown>(undefined);
  const onViewportFitRef = useRef(onViewportFit);
  onViewportFitRef.current = onViewportFit;

  const onElementClickRef = useRef(onElementClick);
  const onElementDoubleClickRef = useRef(onElementDoubleClick);
  const onElementDragRef = useRef(onElementDrag);
  const onConnectionStartRef = useRef(onConnectionStart);
  const onRelationshipClickRef = useRef(onRelationshipClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const onRendererMountRef = useRef(onRendererMount);

  onElementClickRef.current = onElementClick;
  onElementDoubleClickRef.current = onElementDoubleClick;
  onElementDragRef.current = onElementDrag;
  onConnectionStartRef.current = onConnectionStart;
  onRelationshipClickRef.current = onRelationshipClick;
  onBackgroundClickRef.current = onBackgroundClick;
  onRendererMountRef.current = onRendererMount;

  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    const renderer = createRenderer(containerRef.current, model, view, {
      onElementDrag: (id, x, y) => onElementDragRef.current?.(id, x, y),
      readOnly,
    });
    rendererRef.current = renderer;
    onRendererMountRef.current?.(renderer);

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

    renderer.onConnectionComplete((_sourceId, targetId) => {
      onElementClickRef.current?.(targetId);
    });

    renderer.onRelationshipClick((relationshipId) => {
      onRelationshipClickRef.current?.(relationshipId);
    });

    renderer.onBackgroundClick(() => {
      onBackgroundClickRef.current?.();
    });

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []); // eslint-disable-line -- intentional: runs once on mount only

  useEffect(() => {
    rendererRef.current?.setConnectionPreview(connectionStartId ?? null);
  }, [connectionStartId]);

  useEffect(() => {
    rendererRef.current?.updateLayout(model, view, {
      boundaryElementIds: boundaryElementIds ?? [],
      externalElementIds: externalElementIds ?? [],
      boundaryLabel,
    });
  }, [model, view, boundaryElementIds, externalElementIds, boundaryLabel]);

  // Declared AFTER the layout effect on purpose: effects run in order, so the new
  // layout is drawn before we measure it.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || fitKey === undefined || lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    onViewportFitRef.current?.(renderer.fitToContent());
  }, [fitKey, model, view]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    />
  );
}

export type { MapCanvasProps };
