import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { Renderer } from '@archatlas/renderer';
import type { ArchitectureModel, View } from '@archatlas/core-model';
import { MapCanvas } from '../map-canvas';
import { ZoomControls } from '../zoom-controls';
import { useZoom } from '../../hooks/useZoom';
import {
  type DiagramLevel,
  getVisibleElements,
  getChildLevel,
  getParentLevel,
  deriveViewRelationships,
} from '../../services/diagram-navigation';
import { placeExternalElements } from '../../services/external-placement';

export interface DiagramViewerProps {
  model: ArchitectureModel | null;
  view: View | null;
  isLoading?: boolean;
  error?: string | null;
}

export function DiagramViewer({ model, view, isLoading, error }: DiagramViewerProps) {
  const { zoomLevel, zoomIn, zoomOut, fitToView, syncZoomLevel, attachToRenderer } = useZoom();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [focusedElementId, setFocusedElementId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<DiagramLevel>('landscape');

  // Reset navigation whenever the model changes (new diagram loaded)
  useEffect(() => {
    setFocusedElementId(null);
    setCurrentLevel('landscape');
  }, [model]);

  const visibleElements = useMemo(() => {
    if (!model) return [];
    return getVisibleElements(model, currentLevel, focusedElementId);
  }, [model, currentLevel, focusedElementId]);

  // A new identity whenever a different diagram loads or the view drills in/out —
  // MapCanvas re-frames the content on each change, so externals placed left of
  // the boundary (and anything else off-origin) are always brought into view.
  const fitKey = useMemo(() => ({}), [model, focusedElementId]);

  // Relationships whose endpoints aren't both visible at the current level (e.g. two
  // containers in different systems, viewed at the landscape level) need to be bubbled
  // up to their nearest visible ancestor so a connection still renders between the two
  // system boxes. Computed at every level, not just when drilled in, since the renderer
  // only ever draws edges whose exact sourceId/targetId are present in the visible node set.
  const viewRelationships = useMemo(() => {
    if (!model) return { directRelationships: [], derivedRelationships: [], externalElements: [] };
    const visibleIds = new Set(visibleElements.map((e) => e.id));
    return deriveViewRelationships(model, visibleIds);
  }, [model, visibleElements]);

  // External neighbor boxes are only shown when drilled into a boundary (system/container)
  const externalElements = useMemo(
    () => (focusedElementId ? viewRelationships.externalElements : []),
    [focusedElementId, viewRelationships]
  );

  const externalElementIds = useMemo(() => externalElements.map((e) => e.id), [externalElements]);

  // Substitute the model's relationships with the level-scoped (direct + derived) set so
  // MapCanvas — which draws straight from `model.relationships` — only ever sees edges
  // whose endpoints are actually present in the visible node set at this level.
  const renderedModel = useMemo(() => {
    if (!model) return null;
    return {
      ...model,
      relationships: [
        ...viewRelationships.directRelationships,
        ...viewRelationships.derivedRelationships,
      ],
    };
  }, [model, viewRelationships]);

  const filteredView = useMemo(() => {
    if (!view) return null;
    const visibleIds = new Set(visibleElements.map((e) => e.id));
    const boundaryNodes = view.layout.nodes.filter((n) => visibleIds.has(n.elementId));

    // Externals follow the flow: callers into the boundary on its left, things it
    // calls out to on its right, level with what they connect to. The canvas frames
    // all content on load, so their x may lie outside the boundary's own extent.
    const externalNodes = placeExternalElements(
      externalElements,
      viewRelationships.derivedRelationships,
      boundaryNodes
    );

    return {
      ...view,
      layout: {
        ...view.layout,
        nodes: [...boundaryNodes, ...externalNodes],
      },
    };
  }, [view, visibleElements, externalElements, viewRelationships]);

  const boundaryElementIds = useMemo(
    () => (focusedElementId ? visibleElements.map((e) => e.id) : []),
    [focusedElementId, visibleElements]
  );

  const focusedElement = useMemo(
    () =>
      focusedElementId && model
        ? (model.elements.find((e) => e.id === focusedElementId) ?? null)
        : null,
    [focusedElementId, model]
  );

  const boundaryLabel = useMemo(() => {
    if (!focusedElement) return undefined;
    const kindLabel =
      focusedElement.kind === 'system'
        ? 'System'
        : focusedElement.kind === 'container'
          ? 'Container'
          : focusedElement.kind.charAt(0).toUpperCase() + focusedElement.kind.slice(1);
    return `${kindLabel} Boundary: ${focusedElement.name}`;
  }, [focusedElement]);

  const handleDrillDown = useCallback(
    (elementId: string) => {
      if (!model) return;
      const element = model.elements.find((e) => e.id === elementId);
      if (!element || element.isExternal) return;
      const childLevel = getChildLevel(currentLevel);
      if (childLevel) {
        setFocusedElementId(elementId);
        setCurrentLevel(childLevel);
      }
    },
    [model, currentLevel]
  );

  const handleBack = useCallback(() => {
    if (!model || !focusedElementId) return;
    const focusedEl = model.elements.find((e) => e.id === focusedElementId);
    setFocusedElementId(focusedEl?.parentId ?? null);
    const parentLevel = getParentLevel(currentLevel);
    setCurrentLevel(parentLevel ?? 'landscape');
  }, [model, focusedElementId, currentLevel]);

  const onRendererMount = useCallback((renderer: Renderer) => {
    rendererRef.current = renderer;
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const container = wrapperRef.current;
    if (!renderer || !container) return;
    return attachToRenderer(renderer, container);
  }, [attachToRenderer, model]);

  if (isLoading) {
    return (
      <div
        data-testid="diagram-viewer-loading"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}
      >
        Loading diagram…
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="diagram-viewer-error"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: '#e74c3c',
        }}
      >
        {error}
      </div>
    );
  }

  if (!model || !view || model.elements.length === 0) {
    return (
      <div
        data-testid="diagram-viewer-empty"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: '#888',
        }}
      >
        This diagram has no elements yet.
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {focusedElementId && (
        <div
          style={{
            padding: '4px 12px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            background: '#fafafa',
            flexShrink: 0,
          }}
        >
          <button
            aria-label="Back to parent view"
            onClick={handleBack}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#555',
              padding: 0,
            }}
          >
            ← Back
          </button>
          <span style={{ color: '#888' }}>·</span>
          <span style={{ color: '#333', fontWeight: 500 }}>{focusedElement?.name}</span>
        </div>
      )}
      <MapCanvas
        readOnly
        model={renderedModel ?? model}
        view={filteredView ?? view}
        onElementDoubleClick={handleDrillDown}
        onRendererMount={onRendererMount}
        boundaryElementIds={boundaryElementIds}
        externalElementIds={externalElementIds}
        boundaryLabel={boundaryLabel}
        fitKey={fitKey}
        onViewportFit={syncZoomLevel}
      />
      <ZoomControls
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitToView={fitToView}
      />
    </div>
  );
}
