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
}

export function MapCanvas({ model, view, onElementClick, onElementDoubleClick, onElementDrag }: MapCanvasProps) {
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
    
    // Note: We can't dynamically update callbacks in the current renderer implementation
    // But the initial callbacks will be set up on creation
  }, [onElementClick, onElementDoubleClick, onElementDrag]);

  // Setup callbacks once renderer is ready (only on mount)
  useEffect(() => {
    if (!rendererRef.current) return;

    console.log('[MapCanvas] Setting up callbacks', { 
      hasOnElementClick: !!onElementClick,
      hasOnElementDoubleClick: !!onElementDoubleClick,
      hasOnElementDrag: !!onElementDrag
    });

    // Setup click callback
    if (onElementClick) {
      rendererRef.current.onClick(onElementClick);
    }

    // Setup drill-down callback (double-click)
    if (onElementDoubleClick) {
      rendererRef.current.onDrillDown(onElementDoubleClick);
    }

    // Setup drag callback
    if (onElementDrag) {
      console.log('[MapCanvas] Registering drag callback');
      rendererRef.current.onDrag(onElementDrag);
    }
  }, [onElementClick, onElementDoubleClick, onElementDrag]);

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
      }}
    />
  );
}
