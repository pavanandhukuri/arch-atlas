'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  useZoom,
  deriveViewRelationships,
  placeExternalElements,
} from '@archatlas/viewer-components';
import type { Renderer } from '@archatlas/renderer';
import type { Relationship } from '@archatlas/core-model';
import { StudioHeader, StudioCanvasPane, StudioSidebarPanel } from '@/components/studio';
import { ElementPalette } from '@/components/element-palette';
import { ConnectionStatusBanner } from '@/components/storage/ConnectionStatusBanner';
import { ConflictResolutionDialog } from '@/components/storage/ConflictResolutionDialog';
import { StoragePromptDialog } from '@/components/storage/StoragePromptDialog';
import { useGoogleDriveAuth, type GoogleDriveAuthState } from '@/hooks/useGoogleDriveAuth';
import { useStudioDocument } from '@/hooks/useStudioDocument';
import { useDiagramNavigation } from '@/hooks/useDiagramNavigation';
import { useDiagramEditorState } from '@/hooks/useDiagramEditorState';
import { useExternalElementPositions } from '@/hooks/useExternalElementPositions';
import { buildElementOptions } from '@/services/derived-relationships';
import {
  getBoundaryLabel,
  getVisibleElements,
  type DiagramLevel,
} from '@/services/diagram-context';

export default function StudioPage() {
  const router = useRouter();
  const driveAuth: GoogleDriveAuthState = useGoogleDriveAuth();

  // navigateToLevel (defined below, after `navigation` exists) needs to be reachable from
  // useStudioDocument's onFileOpened callback, which is wired up before `navigation` exists —
  // bridged via this ref rather than reordering the hooks into a dependency cycle.
  const navigateToLevelRef = useRef<(level: DiagramLevel, focusId?: string | null) => void>(
    () => {}
  );
  const studioDocument = useStudioDocument({
    driveAuth,
    onFileOpened: () => navigateToLevelRef.current('landscape', null),
  });
  const { model, modelStore } = studioDocument;

  const navigation = useDiagramNavigation(model);
  const { currentLevel, focusedElementId, focusedElement, breadcrumbs, diagramTitle } = navigation;

  // Same bridging problem as above, the other direction: navigating must close whichever
  // editor panel is open, but the editor-state hook (created below) is also the thing that
  // calls navigateToLevel (double-click drill-down) — so the "close panels" step is applied
  // here, wrapping navigation's own navigateToLevel, rather than inside either hook.
  const closeEditorsRef = useRef<() => void>(() => {});
  const navigateToLevel = useCallback(
    (level: DiagramLevel, focusId: string | null = null) => {
      closeEditorsRef.current();
      navigation.navigateToLevel(level, focusId);
    },
    [navigation]
  );
  navigateToLevelRef.current = navigateToLevel;

  const editorState = useDiagramEditorState({
    model,
    modelStore,
    focusedElementId,
    currentLevel,
    navigateToLevel,
  });
  closeEditorsRef.current = editorState.closeEditors;

  const { zoomLevel, zoomIn, zoomOut, fitToView, syncZoomLevel, attachToRenderer } = useZoom();
  const studioCanvasRef = useRef<HTMLElement>(null);
  const studioRendererRef = useRef<Renderer | null>(null);
  const onStudioRendererMount = useCallback((r: Renderer) => {
    studioRendererRef.current = r;
  }, []);

  // Frame the diagram (externals included) when a different diagram loads or the
  // view drills in/out — but NOT on ordinary edits/drags, which would make the
  // viewport jump under the user. A diagram's identity is its title + creation
  // stamp, which edits never change.
  const diagramIdentity = model ? `${model.metadata.title}|${model.metadata.createdAt ?? ''}` : '';
  const fitKey = useMemo(() => ({}), [diagramIdentity, focusedElementId]);
  const externalViewKey = `${currentLevel}|${focusedElementId ?? ''}`;

  const visibleElements = getVisibleElements(model, currentLevel, focusedElementId);

  // Derive cross-layer relationships for the current view
  const visibleElementIds = new Set(visibleElements.map((e) => e.id));
  const { directRelationships, derivedRelationships, externalElements } = model
    ? deriveViewRelationships(model, visibleElementIds)
    : { directRelationships: [], derivedRelationships: [], externalElements: [] };

  const viewRelationships = [
    ...directRelationships,
    ...derivedRelationships.filter(
      (dr) =>
        !directRelationships.some((d) => d.sourceId === dr.sourceId && d.targetId === dr.targetId)
    ),
  ];

  const boundaryElementIds = visibleElements.map((e) => e.id);
  const externalElementIds = externalElements.map((e) => e.id);

  const { externalPositions, handleElementDrag } = useExternalElementPositions(
    modelStore,
    diagramIdentity,
    externalViewKey,
    externalElementIds
  );

  // The relationship shown in the sidebar editor (pending new creation takes priority).
  // Derived relationships (id: "derived-*") aren't in model.relationships, so fall back to viewRelationships.
  const editorRelationship: Relationship | null =
    editorState.pendingNewRelationship ??
    (editorState.selectedRelationshipId
      ? (model?.relationships.find((r) => r.id === editorState.selectedRelationshipId) ??
        viewRelationships.find((r) => r.id === editorState.selectedRelationshipId) ??
        null)
      : null);

  const currentView = model?.views[0];
  const elementOptions = model ? buildElementOptions(model) : [];

  const allViewElements = [...visibleElements, ...externalElements];
  const boundaryLabel = getBoundaryLabel(focusedElement);

  // Default positions for external elements the user hasn't dragged yet: callers
  // on the left of the boundary, things it calls on the right, level with what
  // they connect to (computed here so the renderer receives correct positions).
  const defaultExternalNodes = currentView
    ? placeExternalElements(
        externalElements,
        viewRelationships,
        boundaryElementIds
          .map((id) => currentView.layout.nodes.find((n) => n.elementId === id))
          .filter((n): n is NonNullable<typeof n> => n !== undefined)
      )
    : [];

  const filteredView = currentView
    ? {
        ...currentView,
        layout: {
          ...currentView.layout,
          nodes: [
            // Visible (boundary) elements keep their stored positions
            ...currentView.layout.nodes.filter((node) =>
              visibleElements.some((elem) => elem.id === node.elementId)
            ),
            // External elements: a position the user dragged them to, else the flow-based default
            ...defaultExternalNodes.map((node) => {
              const stored = externalPositions[node.elementId];
              return stored ? { ...node, x: stored.x, y: stored.y } : node;
            }),
          ],
        },
      }
    : undefined;

  const canvasModel = model
    ? { ...model, elements: allViewElements, relationships: viewRelationships }
    : null;

  // Attach zoom listeners whenever the canvas model changes (renderer may remount)
  useEffect(() => {
    const renderer = studioRendererRef.current;
    const container = studioCanvasRef.current;
    if (!renderer || !container) return;
    return attachToRenderer(renderer, container);
  }, [attachToRenderer, canvasModel]);

  return (
    <div className="studio-layout">
      {/* Connection status banner — shown when Google Drive is offline */}
      <ConnectionStatusBanner storageManager={studioDocument.storageManager} />

      {/* Conflict resolution dialog — shown when a save conflict is detected */}
      {studioDocument.conflictInfo && studioDocument.handle && (
        <ConflictResolutionDialog
          fileName={studioDocument.handle.fileName}
          localTimestamp={new Date().toISOString()}
          remoteTimestamp={studioDocument.conflictInfo.remoteModified}
          onKeepMine={studioDocument.handleKeepMine}
          onLoadRemote={studioDocument.handleLoadRemote}
        />
      )}

      {/* Storage location prompt — modal, shown on app init, New, and Open */}
      {studioDocument.showStoragePrompt && (
        <StoragePromptDialog
          mode={studioDocument.showStoragePrompt}
          onLocalSelected={studioDocument.handleStorageSelected}
          onDriveSelected={studioDocument.handleStorageSelected}
          driveAuth={driveAuth}
          onImportRepos={
            studioDocument.showStoragePrompt === 'startup'
              ? () => router.push('/import')
              : undefined
          }
        />
      )}

      <StudioHeader
        breadcrumbs={breadcrumbs}
        onNavigate={navigateToLevel}
        saveStatus={studioDocument.saveStatus}
        saveStatusMessage={studioDocument.saveStatusMessage}
        hasModel={model !== null}
        hasHandle={studioDocument.handle !== null}
        isDirty={studioDocument.isDirty}
        onImportRepos={() => router.push('/import')}
        onNewFile={studioDocument.handleNewFile}
        onOpenFile={studioDocument.handleImportClick}
        onManualSave={() => void studioDocument.handleManualSave()}
        onExport={studioDocument.handleExport}
      />
      <div className="studio-content">
        <ElementPalette
          currentLevel={currentLevel}
          onAddElement={editorState.handleAddElement}
          onAddContainerSubtype={editorState.handleAddContainerSubtype}
        />
        <StudioCanvasPane
          canvasRef={studioCanvasRef}
          diagramTitle={model ? diagramTitle : null}
          canvasModel={canvasModel}
          filteredView={filteredView}
          connectionStartId={editorState.connectionStartId}
          boundaryElementIds={boundaryElementIds}
          externalElementIds={externalElementIds}
          boundaryLabel={boundaryLabel}
          fitKey={fitKey}
          zoomLevel={zoomLevel}
          onElementClick={editorState.handleElementClick}
          onElementDoubleClick={editorState.handleElementDoubleClick}
          onElementDrag={handleElementDrag}
          onConnectionStart={editorState.handleConnectionStart}
          onRelationshipClick={editorState.handleRelationshipClick}
          onBackgroundClick={editorState.closeEditors}
          onRendererMount={onStudioRendererMount}
          onViewportFit={syncZoomLevel}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitToView={fitToView}
        />
        <StudioSidebarPanel
          editingElement={editorState.editingElement}
          editorRelationship={editorRelationship}
          allElements={model?.elements ?? []}
          allRelationships={model?.relationships ?? []}
          elementOptions={elementOptions}
          sourceElementName={
            editorRelationship
              ? model?.elements.find((e) => e.id === editorRelationship.sourceId)?.name
              : undefined
          }
          targetElementName={
            editorRelationship
              ? model?.elements.find((e) => e.id === editorRelationship.targetId)?.name
              : undefined
          }
          onClose={editorState.closeEditors}
          onSaveElement={editorState.handleSaveElement}
          onDeleteElement={editorState.handleDeleteElement}
          onEditRelationship={editorState.handleEditRelationshipFromElement}
          onAddRelationship={editorState.handleAddRelationshipFromElement}
          onMarkExternal={editorState.handleMarkExternal}
          onFormatChange={editorState.handleFormatChange}
          onSaveRelationship={editorState.handleSaveRelationship}
          onDeleteRelationship={editorState.handleDeleteRelationship}
          onCancelRelationshipEdit={editorState.handleCancelRelationshipEdit}
        />
      </div>
    </div>
  );
}
