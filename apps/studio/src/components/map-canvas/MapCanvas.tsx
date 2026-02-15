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
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // Create renderer only once
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    // Create renderer
    const renderer = createRenderer(containerRef.current, model, view, {
      onElementDrag,
    });
    rendererRef.current = renderer;

    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []);

  // Update callbacks when they change
  useEffect(() => {
    if (!rendererRef.current) return;
  }, [onElementClick, onElementDoubleClick, onElementDrag, onConnectionStart, onRelationshipClick]);

  // Setup callbacks once renderer is ready (only on mount)
  useEffect(() => {
    if (!rendererRef.current) return;

    if (onElementClick) {
      rendererRef.current.onClick(onElementClick);
    }

    if (onElementDoubleClick) {
      rendererRef.current.onDrillDown(onElementDoubleClick);
    }

    if (onElementDrag) {
      rendererRef.current.onDrag(onElementDrag);
    }

    if (onConnectionStart) {
      rendererRef.current.onConnectionStart(onConnectionStart);
    }

    // Wire up drag-to-connect completion
    rendererRef.current.onConnectionComplete((sourceId, targetId) => {
      // Trigger onElementClick for the target to complete the connection
      if (onElementClick) {
        onElementClick(targetId);
      }
    });

    if (onRelationshipClick) {
      rendererRef.current.onRelationshipClick(onRelationshipClick);
    }
  }, [onElementClick, onElementDoubleClick, onElementDrag, onConnectionStart, onRelationshipClick]);

  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setConnectionPreview(connectionStartId ?? null);
  }, [connectionStartId]);

  // Update renderer when model/view changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateLayout(model, view);
    }
  }, [model, view]);

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
