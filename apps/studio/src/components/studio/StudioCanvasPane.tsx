'use client';

import type { Ref } from 'react';
import { MapCanvas, ZoomControls } from '@archatlas/viewer-components';
import type { Renderer } from '@archatlas/renderer';
import type { ArchitectureModel, View } from '@archatlas/core-model';

export interface StudioCanvasPaneProps {
  canvasRef: Ref<HTMLElement>;
  diagramTitle: string | null;
  canvasModel: ArchitectureModel | null;
  filteredView: View | undefined;
  connectionStartId: string | null;
  boundaryElementIds: string[];
  externalElementIds: string[];
  boundaryLabel: string | undefined;
  fitKey: unknown;
  zoomLevel: number;
  onElementClick: (elementId: string) => void;
  onElementDoubleClick: (elementId: string) => void;
  onElementDrag: (elementId: string, x: number, y: number) => void;
  onConnectionStart: (elementId: string) => void;
  onRelationshipClick: (relationshipId: string) => void;
  onBackgroundClick: () => void;
  onRendererMount: (renderer: Renderer) => void;
  onViewportFit: (zoom: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
}

/** The main canvas area: the diagram title, the rendered map, and its zoom controls. */
export function StudioCanvasPane({
  canvasRef,
  diagramTitle,
  canvasModel,
  filteredView,
  connectionStartId,
  boundaryElementIds,
  externalElementIds,
  boundaryLabel,
  fitKey,
  zoomLevel,
  onElementClick,
  onElementDoubleClick,
  onElementDrag,
  onConnectionStart,
  onRelationshipClick,
  onBackgroundClick,
  onRendererMount,
  onViewportFit,
  onZoomIn,
  onZoomOut,
  onFitToView,
}: StudioCanvasPaneProps) {
  return (
    <main className="studio-canvas" ref={canvasRef}>
      {diagramTitle && <div className="canvas-title">{diagramTitle}</div>}
      {canvasModel && filteredView && (
        <MapCanvas
          model={canvasModel}
          view={filteredView}
          onElementClick={onElementClick}
          onElementDoubleClick={onElementDoubleClick}
          onElementDrag={onElementDrag}
          onConnectionStart={onConnectionStart}
          onRelationshipClick={onRelationshipClick}
          onBackgroundClick={onBackgroundClick}
          connectionStartId={connectionStartId}
          boundaryElementIds={boundaryElementIds}
          externalElementIds={externalElementIds}
          boundaryLabel={boundaryLabel}
          onRendererMount={onRendererMount}
          fitKey={fitKey}
          onViewportFit={onViewportFit}
        />
      )}
      {canvasModel && (
        <ZoomControls
          zoomLevel={zoomLevel}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onFitToView={onFitToView}
        />
      )}
    </main>
  );
}
