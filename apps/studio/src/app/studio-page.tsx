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
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [connectionStartId, setConnectionStartId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize navigation state from URL params
  const levelParam = searchParams.get('level') as DiagramLevel | null;
  const focusParam = searchParams.get('focus');
  
  const [currentLevel, setCurrentLevel] = useState<DiagramLevel>(levelParam || 'landscape');
  const [focusedElementId, setFocusedElementId] = useState<string | null>(focusParam || null);

  // Sync URL with navigation state
  const updateURL = useCallback((level: DiagramLevel, focusId: string | null) => {
    const params = new URLSearchParams();
    params.set('level', level);
    if (focusId) {
      params.set('focus', focusId);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router]);

  // Update local state and URL when navigating
  const navigateToLevel = useCallback((level: DiagramLevel, focusId: string | null = null) => {
    setCurrentLevel(level);
    setFocusedElementId(focusId);
    updateURL(level, focusId);
  }, [updateURL]);

  useEffect(() => {
    // Set up model subscription FIRST
    const unsubscribe = modelStore.subscribe(state => {
      setModel(state.model);
    });
    
    // Try to load autosaved model or create new one
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
      views: [
        {
          id: 'view-1',
          title: 'System Context',
          level: 'system',
          layout: {
            algorithm: 'deterministic-v1',
            nodes: [],
            edges: [],
          },
        },
      ],
    };

    modelStore.loadModel(initialModel);
    
    // Also set the model directly to ensure first render has data
    setModel(initialModel);

    return () => {
      unsubscribe();
    };
  }, []);

  // Autosave whenever model changes
  useEffect(() => {
    if (model && modelStore.getState().isDirty) {
      autosaveManager.saveToLocalStorage(model);
    }
  }, [model]);

  const handleAddElement = (kind: ElementKind) => {
    if (!model) return;

    const newElement: Element = {
      id: `elem-${Date.now()}`,
      name: `New ${kind}`,
      kind,
      description: '',
    };
    
    // Handle hierarchy: if we're adding a system at the top level, create an implicit landscape parent
    let updatedElements = [...model.elements];
    
    if (focusedElementId) {
      // We're in a focused context, set the parent
      newElement.parentId = focusedElementId;
      updatedElements.push(newElement);
    } else if (kind === 'system') {
      // Adding a system at the top level - need a landscape parent
      // Check if we already have a default landscape
      let landscape = model.elements.find(e => e.kind === 'landscape' && !e.parentId);
      
      if (!landscape) {
        // Create an implicit landscape container
        landscape = {
          id: `landscape-${Date.now()}`,
          name: 'Architecture Landscape',
          kind: 'landscape' as ElementKind,
          description: 'Top-level architecture landscape',
        };
        updatedElements.push(landscape);
      }
      
      // Set the landscape as parent for the new system
      newElement.parentId = landscape.id;
      updatedElements.push(newElement);
    } else {
      // For other kinds at top level (shouldn't happen normally)
      updatedElements.push(newElement);
    }

    // Instead of recomputing the entire layout (which resets positions),
    // add new nodes to the existing layout with default positions
    const currentView = model.views[0];
    const updatedViews = currentView ? [
      {
        ...currentView,
        layout: {
          ...currentView.layout,
          nodes: [
            ...currentView.layout.nodes,
            // Add new element with a default position (stagger to avoid overlaps)
            {
              elementId: newElement.id,
              x: 100 + (updatedElements.length * 30), // Stagger horizontally
              y: 100 + (updatedElements.length * 20), // Stagger vertically
              w: 120,
              h: 80,
            },
          ],
        },
      },
      ...model.views.slice(1),
    ] : model.views;

    const updatedModel = {
      ...model,
      elements: updatedElements,
      views: updatedViews,
    };

    modelStore.updateModel(updatedModel);

    // Auto-select the new element for immediate editing
    setEditingElement(newElement);
  };

  const handleSaveElement = (element: Element) => {
    if (!model) return;

    const isExistingElement = element.id && model.elements.find(e => e.id === element.id);
    const updatedElements = isExistingElement
      ? model.elements.map(e => (e.id === element.id ? element : e))
      : [...model.elements, { ...element, id: `elem-${Date.now()}` }];

    // Only recompute layout for NEW elements
    // For existing elements, preserve the current layout to avoid resetting manual positions
    const currentView = model.views[0];
    const updatedViews = currentView && !isExistingElement ? [
      {
        ...currentView,
        layout: computeLayout(
          { ...model, elements: updatedElements },
          currentView,
          { algorithm: 'deterministic-v1' }
        ),
      },
      ...model.views.slice(1),
    ] : model.views;

    const updatedModel = {
      ...model,
      elements: updatedElements,
      views: updatedViews,
    };

    modelStore.updateModel(updatedModel);

    setEditingElement(null);
  };

  const handleElementClick = useCallback(
    (elementId: string) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;

      const element = currentModel.elements.find(e => e.id === elementId);
      if (!element) return;

      if (connectionStartId) {
        if (connectionStartId !== elementId) {
          const currentView = currentModel.views[0];
          if (currentView) {
            const updatedModel = addRelationshipToModel({
              model: currentModel,
              viewId: currentView.id,
              sourceId: connectionStartId,
              targetId: elementId,
              type: 'relates_to',
            });
            modelStore.updateModel(updatedModel);
          }
        }
        setConnectionStartId(null);
        setSelectedRelationshipId(null);
        setEditingElement(element);
        return;
      }

      setSelectedRelationshipId(null);
      setEditingElement(element);
    },
    [connectionStartId]
  );

  const handleElementDoubleClick = useCallback(
    (elementId: string) => {
      if (connectionStartId) {
        return;
      }

      // Close edit panel first
      setEditingElement(null);

      // Use latest state from store
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;

      const element = currentModel.elements.find(e => e.id === elementId);
      if (!element) return;

      if (canDrillDown(currentLevel)) {
        const childLevel = getChildLevel(currentLevel);
        if (childLevel) {
          navigateToLevel(childLevel, elementId);
        }
      }
    },
    [currentLevel, navigateToLevel, connectionStartId]
  );

  const handleConnectionStart = useCallback((elementId: string) => {
    setConnectionStartId(elementId);
    setSelectedRelationshipId(null);
    setEditingElement(null);
  }, []);

  const handleRelationshipClick = useCallback((relationshipId: string) => {
    setSelectedRelationshipId(relationshipId);
    setConnectionStartId(null);
    setEditingElement(null);
  }, []);

  const handleCancelConnection = useCallback(() => {
    setConnectionStartId(null);
  }, []);

  const handleSaveRelationship = useCallback((relationship: Relationship) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;

    const updatedRelationships = currentModel.relationships.map(rel =>
      rel.id === relationship.id ? relationship : rel
    );

    const updatedModel = {
      ...currentModel,
      relationships: updatedRelationships,
    };

    modelStore.updateModel(updatedModel);
    setSelectedRelationshipId(null);
  }, []);

  const handleDeleteRelationship = useCallback(() => {
    if (!selectedRelationshipId) return;

    const currentModel = modelStore.getState().model;
    if (!currentModel) return;

    const updatedModel = removeRelationshipFromModel(currentModel, selectedRelationshipId);
    modelStore.updateModel(updatedModel);
    setSelectedRelationshipId(null);
  }, [selectedRelationshipId]);

  const handleNavigateUp = useCallback(() => {
    if (canDrillUp(currentLevel)) {
      const parentLevel = getParentLevel(currentLevel);
      if (parentLevel) {
        // Reset focus to parent or null - use latest model
        const currentModel = modelStore.getState().model;
        const focusedElement = currentModel?.elements.find(e => e.id === focusedElementId);
        const parentFocusId = focusedElement?.parentId || null;

        setConnectionStartId(null);
        setSelectedRelationshipId(null);
        navigateToLevel(parentLevel, parentFocusId);
      }
    }
  }, [currentLevel, focusedElementId, navigateToLevel]);

  // Filter elements based on current diagram level
  const getVisibleElements = (): Element[] => {
    if (!model) return [];
    
    // If we're focused on an element, show its children
    if (focusedElementId) {
      return model.elements.filter(e => e.parentId === focusedElementId);
    }
    
    // Otherwise, show elements of the appropriate kind for this level
    const targetKind = getElementKindForLevel(currentLevel);
    
    if (currentLevel === 'landscape') {
      // In landscape, show all systems (they now have a landscape parent, but we show them anyway)
      // Filter out the implicit landscape container itself
      return model.elements.filter(e => e.kind === 'system');
    }
    
    return model.elements.filter(e => e.kind === targetKind && !e.parentId);
  };

  const visibleElements = getVisibleElements();
  const focusedElement = focusedElementId ? model?.elements.find(e => e.id === focusedElementId) : null;
  const diagramTitle = getDiagramTitle(currentLevel, focusedElement?.name);
  const selectedRelationship: Relationship | null = selectedRelationshipId
    ? model?.relationships.find(rel => rel.id === selectedRelationshipId) ?? null
    : null;

  const currentView = model?.views[0];
  const isDirty = modelStore.getState().isDirty;

  // Create a filtered view that only includes nodes for visible elements
  const filteredView = currentView ? {
    ...currentView,
    layout: {
      ...currentView.layout,
      nodes: currentView.layout.nodes.filter(node => 
        visibleElements.some(elem => elem.id === node.elementId)
      ),
    },
  } : undefined;

  const handleElementDrag = useCallback((elementId: string, x: number, y: number) => {
    // Always get latest model from store to avoid stale state
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;

    const updatedView = currentModel.views[0];
    if (!updatedView) return;

    // Update the node position in the layout
    const nodeIndex = updatedView.layout.nodes.findIndex(n => n.elementId === elementId);
    
    if (nodeIndex >= 0) {
      updatedView.layout.nodes[nodeIndex]!.x = x;
      updatedView.layout.nodes[nodeIndex]!.y = y;

      const updatedModel = {
        ...currentModel,
        views: currentModel.views,
      };

      modelStore.updateModel(updatedModel);
    }
  }, []);

  const handleExport = () => {
    if (model) {
      exportModel(model);
      modelStore.clearDirty();
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

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

    // Reset file input
    event.target.value = '';
  };

  const handleNewFile = () => {
    if (confirm('Create a new file? Unsaved changes will be lost.')) {
      const newModel: ArchitectureModel = {
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
        views: [
          {
            id: 'view-1',
            title: 'System Context',
            level: 'system',
            layout: {
              algorithm: 'deterministic-v1',
              nodes: [],
              edges: [],
            },
          },
        ],
      };
      modelStore.loadModel(newModel);
      autosaveManager.clearAutosave();
      
      // Reset navigation to initial state
      navigateToLevel('landscape', null);
    }
  };

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
          <button onClick={handleExport} disabled={!model}>
            Export {isDirty && '*'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.arch.json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
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
          {model && filteredView && (
            <MapCanvas
              model={{...model, elements: visibleElements}}
              view={filteredView}
              onElementClick={handleElementClick}
              onElementDoubleClick={handleElementDoubleClick}
              onElementDrag={handleElementDrag}
              onConnectionStart={handleConnectionStart}
              onRelationshipClick={handleRelationshipClick}
              connectionStartId={connectionStartId}
            />
          )}
        </main>
        <aside className="studio-sidebar">
          {connectionStartId && (
            <div className="connection-banner">
              <span>
                Connecting from{' '}
                <strong>
                  {model?.elements.find(e => e.id === connectionStartId)?.name || 'Unknown'}
                </strong>
              </span>
              <button type="button" onClick={handleCancelConnection}>
                Cancel
              </button>
            </div>
          )}
          {editingElement && (
            <ElementEditor
              element={editingElement}
              onSave={handleSaveElement}
              onCancel={() => setEditingElement(null)}
            />
          )}
          {!editingElement && selectedRelationship && (
            <RelationshipEditor
              relationship={selectedRelationship}
              sourceElementName={model?.elements.find(e => e.id === selectedRelationship.sourceId)?.name}
              targetElementName={model?.elements.find(e => e.id === selectedRelationship.targetId)?.name}
              onSave={handleSaveRelationship}
              onDelete={handleDeleteRelationship}
              onCancel={() => setSelectedRelationshipId(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
