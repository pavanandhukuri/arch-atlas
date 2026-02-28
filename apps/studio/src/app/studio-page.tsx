'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapCanvas } from '@/components/map-canvas';
import { ElementEditor, RelationshipEditor } from '@/components/model-editor';
import { ElementPalette } from '@/components/element-palette';
import { ModelStore } from '@/state/model-store';
import { AutosaveManager } from '@/services/autosave';
import { exportModel, importModel } from '@/services/import-export';
import { addRelationshipToModel, removeRelationshipFromModel } from '@/services/relationships';
import { deriveViewRelationships, buildElementOptions } from '@/services/derived-relationships';
import type { ArchitectureModel, Element, ElementKind, Relationship } from '@arch-atlas/core-model';
import { computeLayout } from '@arch-atlas/layout';
import type { DiagramLevel } from '@/services/diagram-context';
import {
  getDiagramTitle,
  getElementKindForLevel,
  canDrillDown,
  canDrillUp,
  getParentLevel,
  getChildLevel,
} from '@/services/diagram-context';

const modelStore = new ModelStore();
const autosaveManager = new AutosaveManager();

export default function StudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [model, setModel] = useState<ArchitectureModel | null>(null);
  const [editingElement, setEditingElement] = useState<Element | null>(null);
  // Existing relationship being edited (by id in model)
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  // New relationship being created (not yet persisted to model)
  const [pendingNewRelationship, setPendingNewRelationship] = useState<Relationship | null>(null);
  // Remember which element we opened the relationship editor from (so we can go back)
  const [elementBeforeConnection, setElementBeforeConnection] = useState<Element | null>(null);

  const [connectionStartId, setConnectionStartId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Separate positions for external (system-level) elements so they don't share
  // coordinates with the element's position in the landscape/main view.
  // Keyed by elementId. Cleared whenever the user navigates to a new view.
  const [externalPositions, setExternalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const levelParam = searchParams.get('level') as DiagramLevel | null;
  const focusParam = searchParams.get('focus');
  const [currentLevel, setCurrentLevel] = useState<DiagramLevel>(levelParam || 'landscape');
  const [focusedElementId, setFocusedElementId] = useState<string | null>(focusParam || null);

  const updateURL = useCallback((level: DiagramLevel, focusId: string | null) => {
    const params = new URLSearchParams();
    params.set('level', level);
    if (focusId) params.set('focus', focusId);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router]);

  const navigateToLevel = useCallback((level: DiagramLevel, focusId: string | null = null) => {
    setCurrentLevel(level);
    setFocusedElementId(focusId);
    setExternalPositions({}); // external coords are per-view
    updateURL(level, focusId);
  }, [updateURL]);

  useEffect(() => {
    const unsubscribe = modelStore.subscribe(state => { setModel(state.model); });
    const autosaved = autosaveManager.loadFromLocalStorage();
    const initialModel: ArchitectureModel = autosaved ?? {
      schemaVersion: '0.1.0',
      metadata: {
        title: 'New Architecture',
        description: 'Created with Arch Atlas Studio',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      elements: [],
      relationships: [],
      constraints: [],
      views: [{ id: 'view-1', title: 'System Context', level: 'system', layout: { algorithm: 'deterministic-v1', nodes: [], edges: [] } }],
    };
    modelStore.loadModel(initialModel);
    setModel(initialModel);
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (model && modelStore.getState().isDirty) {
      autosaveManager.saveToLocalStorage(model);
    }
  }, [model]);

  const handleAddElement = (kind: ElementKind) => {
    if (!model) return;
    const newElement: Element = { id: `elem-${Date.now()}`, name: `New ${kind}`, kind, description: '' };
    let updatedElements = [...model.elements];

    if (focusedElementId) {
      newElement.parentId = focusedElementId;
      updatedElements.push(newElement);
    } else if (kind === 'system' || kind === 'person') {
      let landscape = model.elements.find(e => e.kind === 'landscape' && !e.parentId);
      if (!landscape) {
        landscape = { id: `landscape-${Date.now()}`, name: 'Architecture Landscape', kind: 'landscape' as ElementKind, description: 'Top-level architecture landscape' };
        updatedElements.push(landscape);
      }
      newElement.parentId = landscape.id;
      updatedElements.push(newElement);
    } else {
      updatedElements.push(newElement);
    }

    const currentView = model.views[0];
    const updatedViews = currentView ? [{
      ...currentView,
      layout: {
        ...currentView.layout,
        nodes: [...currentView.layout.nodes, { elementId: newElement.id, x: 100 + updatedElements.length * 30, y: 100 + updatedElements.length * 20, w: 200, h: 130 }],
      },
    }, ...model.views.slice(1)] : model.views;

    modelStore.updateModel({ ...model, elements: updatedElements, views: updatedViews });
    setEditingElement(newElement);
  };

  const handleSaveElement = (element: Element) => {
    if (!model) return;
    const isExisting = model.elements.some(e => e.id === element.id);
    const updatedElements = isExisting
      ? model.elements.map(e => e.id === element.id ? element : e)
      : [...model.elements, { ...element, id: `elem-${Date.now()}` }];

    const currentView = model.views[0];
    const updatedViews = currentView && !isExisting ? [{
      ...currentView,
      layout: computeLayout({ ...model, elements: updatedElements }, currentView, { algorithm: 'deterministic-v1' }),
    }, ...model.views.slice(1)] : model.views;

    modelStore.updateModel({ ...model, elements: updatedElements, views: updatedViews });
    setEditingElement(null);
  };

  const handleElementClick = useCallback((elementId: string) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    const element = currentModel.elements.find(e => e.id === elementId);
    if (!element) return;

    if (connectionStartId) {
      if (connectionStartId !== elementId) {
        const currentView = currentModel.views[0];
        if (currentView) {
          modelStore.updateModel(addRelationshipToModel({ model: currentModel, viewId: currentView.id, sourceId: connectionStartId, targetId: elementId, type: 'relates_to' }));
        }
      }
      setConnectionStartId(null);
      setSelectedRelationshipId(null);
      setPendingNewRelationship(null);
      setEditingElement(element);
      return;
    }

    setSelectedRelationshipId(null);
    setPendingNewRelationship(null);
    setElementBeforeConnection(null);
    setEditingElement(element);
  }, [connectionStartId]);

  const handleElementDoubleClick = useCallback((elementId: string) => {
    if (connectionStartId) return;
    setEditingElement(null);
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    const element = currentModel.elements.find(e => e.id === elementId);
    if (!element) return;

    // External (system-level) elements: always navigate to their system diagram.
    // An element is external if it's a system/person not parented under the current focus.
    const isExternal = (element.kind === 'system' || element.kind === 'person')
      && focusedElementId !== null
      && element.parentId !== focusedElementId;
    if (isExternal) {
      navigateToLevel('system', elementId);
      return;
    }

    if (canDrillDown(currentLevel)) {
      const childLevel = getChildLevel(currentLevel);
      if (childLevel) navigateToLevel(childLevel, elementId);
    }
  }, [currentLevel, navigateToLevel, connectionStartId, focusedElementId]);

  const handleConnectionStart = useCallback((elementId: string) => {
    setConnectionStartId(elementId);
    setSelectedRelationshipId(null);
    setPendingNewRelationship(null);
    setEditingElement(null);
  }, []);

  const handleRelationshipClick = useCallback((relationshipId: string) => {
    setSelectedRelationshipId(relationshipId);
    setPendingNewRelationship(null);
    setElementBeforeConnection(null);
    setConnectionStartId(null);
    setEditingElement(null);
  }, []);

  const handleCancelConnection = useCallback(() => { setConnectionStartId(null); }, []);

  const handleDeleteElement = useCallback((elementId: string) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    const toDelete = new Set<string>();
    const queue = [elementId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      toDelete.add(id);
      currentModel.elements.filter(e => e.parentId === id).forEach(child => queue.push(child.id));
    }
    const updatedElements = currentModel.elements.filter(e => !toDelete.has(e.id));
    const updatedRelationships = currentModel.relationships.filter(r => !toDelete.has(r.sourceId) && !toDelete.has(r.targetId));
    const updatedViews = currentModel.views.map(v => ({
      ...v,
      layout: {
        ...v.layout,
        nodes: v.layout.nodes.filter(n => !toDelete.has(n.elementId)),
        edges: v.layout.edges.filter(edge => updatedRelationships.some(r => r.id === edge.relationshipId)),
      },
    }));
    modelStore.updateModel({ ...currentModel, elements: updatedElements, relationships: updatedRelationships, views: updatedViews });
    setEditingElement(null);
  }, []);

  const handleSaveRelationship = useCallback((relationship: Relationship) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;

    // Derived relationships are UI-only — update the original underlying relationship's metadata
    const originalId = (relationship as Relationship & { _originalId?: string })._originalId;
    if (originalId) {
      const updatedRelationships = currentModel.relationships.map(rel =>
        rel.id === originalId
          ? { ...rel, sourceId: relationship.sourceId, targetId: relationship.targetId, action: relationship.action, integrationMode: relationship.integrationMode, description: relationship.description }
          : rel
      );
      modelStore.updateModel({ ...currentModel, relationships: updatedRelationships });
      setSelectedRelationshipId(null);
      setPendingNewRelationship(null);
      if (elementBeforeConnection) {
        const refreshed = modelStore.getState().model?.elements.find(e => e.id === elementBeforeConnection.id) ?? elementBeforeConnection;
        setEditingElement(refreshed);
        setElementBeforeConnection(null);
      }
      return;
    }

    const relToSave = relationship;
    const exists = currentModel.relationships.some(r => r.id === relToSave.id);
    const updatedRelationships = exists
      ? currentModel.relationships.map(rel => rel.id === relToSave.id ? relToSave : rel)
      : [...currentModel.relationships, relToSave];

    // Ensure layout nodes exist for cross-layer endpoints
    const currentView = currentModel.views[0];
    let updatedViews = currentModel.views;
    if (currentView) {
      const existingNodeIds = new Set(currentView.layout.nodes.map(n => n.elementId));
      const newNodes = [...currentView.layout.nodes];
      [relToSave.sourceId, relToSave.targetId].forEach((eid, i) => {
        if (eid && !existingNodeIds.has(eid)) {
          newNodes.push({ elementId: eid, x: 600 + i * 250, y: 80, w: 200, h: 130 });
        }
      });
      updatedViews = [{ ...currentView, layout: { ...currentView.layout, nodes: newNodes } }, ...currentModel.views.slice(1)];
    }

    modelStore.updateModel({ ...currentModel, relationships: updatedRelationships, views: updatedViews });
    setSelectedRelationshipId(null);
    setPendingNewRelationship(null);

    // Return to element editor if we came from one
    if (elementBeforeConnection) {
      const refreshed = modelStore.getState().model?.elements.find(e => e.id === elementBeforeConnection.id) ?? elementBeforeConnection;
      setEditingElement(refreshed);
      setElementBeforeConnection(null);
    }
  }, [elementBeforeConnection]);

  const handleDeleteRelationship = useCallback(() => {
    if (!selectedRelationshipId) return;
    // Derived relationships have no model entry — just close the editor
    if (selectedRelationshipId.startsWith('derived-')) {
      setSelectedRelationshipId(null);
      return;
    }
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    modelStore.updateModel(removeRelationshipFromModel(currentModel, selectedRelationshipId));
    setSelectedRelationshipId(null);
    if (elementBeforeConnection) {
      setEditingElement(elementBeforeConnection);
      setElementBeforeConnection(null);
    }
  }, [selectedRelationshipId, elementBeforeConnection]);

  const handleCancelRelationshipEdit = useCallback(() => {
    setSelectedRelationshipId(null);
    setPendingNewRelationship(null);
    if (elementBeforeConnection) {
      setEditingElement(elementBeforeConnection);
      setElementBeforeConnection(null);
    }
  }, [elementBeforeConnection]);

  // From ElementEditor connections table: click a row to edit that relationship
  const handleEditRelationshipFromElement = useCallback((relationship: Relationship) => {
    setElementBeforeConnection(editingElement);
    setEditingElement(null);
    setSelectedRelationshipId(relationship.id);
    setPendingNewRelationship(null);
  }, [editingElement]);

  // From ElementEditor connections table: click "+ Add Connection"
  const handleAddRelationshipFromElement = useCallback((sourceElementId: string) => {
    const stub: Relationship = { id: `rel-${Date.now()}`, sourceId: sourceElementId, targetId: '', type: 'relates_to' };
    setElementBeforeConnection(editingElement);
    setEditingElement(null);
    setSelectedRelationshipId(null);
    setPendingNewRelationship(stub);
  }, [editingElement]);

  const handleNavigateUp = useCallback(() => {
    if (canDrillUp(currentLevel)) {
      const parentLevel = getParentLevel(currentLevel);
      if (parentLevel) {
        const currentModel = modelStore.getState().model;
        const focusedElement = currentModel?.elements.find(e => e.id === focusedElementId);
        setConnectionStartId(null);
        setSelectedRelationshipId(null);
        navigateToLevel(parentLevel, focusedElement?.parentId || null);
      }
    }
  }, [currentLevel, focusedElementId, navigateToLevel]);

  const getVisibleElements = (): Element[] => {
    if (!model) return [];
    if (focusedElementId) return model.elements.filter(e => e.parentId === focusedElementId);
    if (currentLevel === 'landscape') return model.elements.filter(e => e.kind === 'system' || e.kind === 'person');
    const targetKind = getElementKindForLevel(currentLevel);
    return model.elements.filter(e => e.kind === targetKind && !e.parentId);
  };

  const visibleElements = getVisibleElements();
  const focusedElement = focusedElementId ? model?.elements.find(e => e.id === focusedElementId) : null;
  const diagramTitle = getDiagramTitle(currentLevel, focusedElement?.name);

  // Derive cross-layer relationships for the current view
  const visibleElementIds = new Set(visibleElements.map(e => e.id));
  const { directRelationships, derivedRelationships, externalElements } = model
    ? deriveViewRelationships(model, visibleElementIds)
    : { directRelationships: [], derivedRelationships: [], externalElements: [] };

  const viewRelationships = [
    ...directRelationships,
    ...derivedRelationships.filter(dr => !directRelationships.some(d => d.sourceId === dr.sourceId && d.targetId === dr.targetId)),
  ];

  // The relationship shown in the sidebar editor (pending new creation takes priority)
  // Derived relationships (id: "derived-*") aren't in model.relationships, so fall back to viewRelationships
  const editorRelationship: Relationship | null =
    pendingNewRelationship ??
    (selectedRelationshipId
      ? (model?.relationships.find(r => r.id === selectedRelationshipId)
          ?? viewRelationships.find(r => r.id === selectedRelationshipId)
          ?? null)
      : null);

  const currentView = model?.views[0];
  const isDirty = modelStore.getState().isDirty;
  const elementOptions = model ? buildElementOptions(model) : [];

  const allViewElements = [...visibleElements, ...externalElements];
  const boundaryElementIds = visibleElements.map(e => e.id);
  const externalElementIds = externalElements.map(e => e.id);

  // Compute label for the boundary box (e.g. "System Boundary: My System")
  const boundaryLabel = focusedElement
    ? (() => {
        const kindLabel = focusedElement.kind === 'system' ? 'System'
          : focusedElement.kind === 'container' ? 'Container'
          : focusedElement.kind === 'landscape' ? 'Landscape'
          : focusedElement.kind.charAt(0).toUpperCase() + focusedElement.kind.slice(1);
        return `${kindLabel} Boundary: ${focusedElement.name}`;
      })()
    : undefined;

  // Keep a stable ref so handleElementDrag can check without a stale closure
  const externalElementIdsRef = useRef<string[]>(externalElementIds);
  externalElementIdsRef.current = externalElementIds;

  // Compute the default left-of-boundary X for external elements that have no position yet.
  // We do this in React so the renderer receives correct initial positions.
  const defaultExternalX = (() => {
    if (!currentView || externalElements.length === 0) return 50;
    const boundaryNodes = boundaryElementIds
      .map(id => currentView.layout.nodes.find(n => n.elementId === id))
      .filter(Boolean);
    if (boundaryNodes.length === 0) return 50;
    const minX = Math.min(...boundaryNodes.map(n => n!.x));
    return minX - 280; // 200 wide + 80 gap
  })();

  const filteredView = currentView ? {
    ...currentView,
    layout: {
      ...currentView.layout,
      nodes: [
        // Visible (boundary) elements keep their stored positions
        ...currentView.layout.nodes.filter(node =>
          visibleElements.some(elem => elem.id === node.elementId)
        ),
        // External elements use their dedicated externalPositions (or a stacked default)
        ...externalElements.map((el, i) => {
          const stored = externalPositions[el.id];
          return {
            elementId: el.id,
            x: stored?.x ?? defaultExternalX,
            y: stored?.y ?? (50 + i * 180),
            w: 200,
            h: 130,
          };
        }),
      ],
    },
  } : undefined;

  const handleElementDrag = useCallback((elementId: string, x: number, y: number) => {
    if (externalElementIdsRef.current.includes(elementId)) {
      // Store in separate externalPositions — does NOT touch the main layout
      setExternalPositions(prev => ({ ...prev, [elementId]: { x, y } }));
      return;
    }
    // Regular element — update the main layout
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    const updatedView = currentModel.views[0];
    if (!updatedView) return;
    const nodeIndex = updatedView.layout.nodes.findIndex(n => n.elementId === elementId);
    if (nodeIndex >= 0) {
      updatedView.layout.nodes[nodeIndex]!.x = x;
      updatedView.layout.nodes[nodeIndex]!.y = y;
      modelStore.updateModel({ ...currentModel, views: currentModel.views });
    }
  }, []);

  const handleExport = () => { if (model) { exportModel(model); modelStore.clearDirty(); } };
  const handleImportClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const importedModel = await importModel(file);
      modelStore.loadModel(importedModel);
      autosaveManager.clearAutosave();
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed');
    }
    event.target.value = '';
  };

  const handleNewFile = () => {
    if (confirm('Create a new file? Unsaved changes will be lost.')) {
      const newModel: ArchitectureModel = {
        schemaVersion: '0.1.0',
        metadata: { title: 'New Architecture', description: 'Created with Arch Atlas Studio', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        elements: [],
        relationships: [],
        constraints: [],
        views: [{ id: 'view-1', title: 'System Context', level: 'system', layout: { algorithm: 'deterministic-v1', nodes: [], edges: [] } }],
      };
      modelStore.loadModel(newModel);
      autosaveManager.clearAutosave();
      navigateToLevel('landscape', null);
    }
  };

  const canvasModel = model ? { ...model, elements: allViewElements, relationships: viewRelationships } : null;

  return (
    <div className="studio-layout">
      <header className="studio-header">
        <div className="header-left">
          <h1>Arch Atlas Studio</h1>
          <span className="diagram-title">{diagramTitle}</span>
        </div>
        <div className="header-actions">
          <button onClick={handleNewFile}>New</button>
          <button onClick={handleImportClick}>Open</button>
          <button onClick={handleExport} disabled={!model}>Export {isDirty && '*'}</button>
        </div>
        <input ref={fileInputRef} type="file" accept=".json,.arch.json" onChange={handleFileChange} style={{ display: 'none' }} />
      </header>
      {importError && (
        <div className="error-banner">
          Import Error: {importError}
          <button onClick={() => setImportError(null)}>×</button>
        </div>
      )}
      <div className="studio-content">
        <ElementPalette
          currentLevel={currentLevel}
          onAddElement={handleAddElement}
          onNavigateUp={handleNavigateUp}
          canNavigateUp={canDrillUp(currentLevel)}
        />
        <main className="studio-canvas">
          {canvasModel && filteredView && (
            <MapCanvas
              model={canvasModel}
              view={filteredView}
              onElementClick={handleElementClick}
              onElementDoubleClick={handleElementDoubleClick}
              onElementDrag={handleElementDrag}
              onConnectionStart={handleConnectionStart}
              onRelationshipClick={handleRelationshipClick}
              connectionStartId={connectionStartId}
              boundaryElementIds={boundaryElementIds}
              externalElementIds={externalElementIds}
              boundaryLabel={boundaryLabel}
            />
          )}
        </main>
        <aside className="studio-sidebar">
          {connectionStartId && (
            <div className="connection-banner">
              <span>Connecting from <strong>{model?.elements.find(e => e.id === connectionStartId)?.name || 'Unknown'}</strong></span>
              <button type="button" onClick={handleCancelConnection}>Cancel</button>
            </div>
          )}
          {editingElement && (
            <ElementEditor
              element={editingElement}
              allElements={model?.elements ?? []}
              relationships={model?.relationships ?? []}
              onSave={handleSaveElement}
              onDelete={handleDeleteElement}
              onCancel={() => setEditingElement(null)}
              onEditRelationship={handleEditRelationshipFromElement}
              onAddRelationship={handleAddRelationshipFromElement}
            />
          )}
          {!editingElement && editorRelationship && (
            <RelationshipEditor
              relationship={editorRelationship}
              sourceElementName={model?.elements.find(e => e.id === editorRelationship.sourceId)?.name}
              targetElementName={model?.elements.find(e => e.id === editorRelationship.targetId)?.name}
              elementOptions={elementOptions}
              onSave={handleSaveRelationship}
              onDelete={handleDeleteRelationship}
              onCancel={handleCancelRelationshipEdit}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
