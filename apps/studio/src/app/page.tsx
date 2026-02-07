'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapCanvas } from '@/components/map-canvas';
import { ElementEditor } from '@/components/model-editor';
import { ElementPalette } from '@/components/element-palette';
import { ModelStore } from '@/state/model-store';
import { AutosaveManager } from '@/services/autosave';
import { exportModel, importModel } from '@/services/import-export';
import type { ArchitectureModel, Element, ElementKind } from '@arch-atlas/core-model';
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
  const [model, setModel] = useState<ArchitectureModel | null>(null);
  const [editingElement, setEditingElement] = useState<Element | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Semantic zoom state
  const [currentLevel, setCurrentLevel] = useState<DiagramLevel>('landscape');
  const [focusedElementId, setFocusedElementId] = useState<string | null>(null);

  useEffect(() => {
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

    const unsubscribe = modelStore.subscribe(state => {
      setModel(state.model);
    });

    // Start autosave
    autosaveManager.startAutosave(() => modelStore.getState().model);

    return () => {
      unsubscribe();
      autosaveManager.stopAutosave();
    };
  }, []);

  const handleAddElement = (kind: ElementKind) => {
    if (!model) return;

    const newElement: Element = {
      id: `elem-${Date.now()}`,
      name: `New ${kind}`,
      kind,
      description: '',
    };
    
    // If we're in a focused context, set the parent
    if (focusedElementId) {
      newElement.parentId = focusedElementId;
    }

    const updatedElements = [...model.elements, newElement];

    // Recompute layout
    const updatedView = model.views[0];
    if (updatedView) {
      updatedView.layout = computeLayout(
        { ...model, elements: updatedElements },
        updatedView,
        { algorithm: 'deterministic-v1' }
      );
    }

    modelStore.updateModel({
      ...model,
      elements: updatedElements,
      views: model.views,
    });

    // Auto-select the new element for immediate editing
    setEditingElement(newElement);
  };

  const handleSaveElement = (element: Element) => {
    if (!model) return;

    const updatedElements = element.id && model.elements.find(e => e.id === element.id)
      ? model.elements.map(e => (e.id === element.id ? element : e))
      : [...model.elements, { ...element, id: `elem-${Date.now()}` }];

    // Recompute layout
    const updatedView = model.views[0];
    if (updatedView) {
      updatedView.layout = computeLayout(
        { ...model, elements: updatedElements },
        updatedView,
        { algorithm: 'deterministic-v1' }
      );
    }

    modelStore.updateModel({
      ...model,
      elements: updatedElements,
      views: model.views,
    });

    setEditingElement(null);
  };

  const handleElementClick = useCallback((elementId: string) => {
    // Use functional state update to always get latest model
    setEditingElement(prev => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return null;

      const element = currentModel.elements.find(e => e.id === elementId);
      return element || null;
    });
  }, []);

  const handleElementDoubleClick = useCallback((elementId: string) => {
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
        setCurrentLevel(childLevel);
        setFocusedElementId(elementId);
      }
    }
  }, [currentLevel]);

  const handleNavigateUp = useCallback(() => {
    if (canDrillUp(currentLevel)) {
      const parentLevel = getParentLevel(currentLevel);
      if (parentLevel) {
        setCurrentLevel(parentLevel);
        // Reset focus to parent or null - use latest model
        const currentModel = modelStore.getState().model;
        const focusedElement = currentModel?.elements.find(e => e.id === focusedElementId);
        setFocusedElementId(focusedElement?.parentId || null);
      }
    }
  }, [currentLevel, focusedElementId]);

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
      // In landscape, show all systems (no parent)
      return model.elements.filter(e => e.kind === 'system' && !e.parentId);
    }
    
    return model.elements.filter(e => e.kind === targetKind && !e.parentId);
  };

  const visibleElements = getVisibleElements();
  const focusedElement = focusedElementId ? model?.elements.find(e => e.id === focusedElementId) : null;
  const diagramTitle = getDiagramTitle(currentLevel, focusedElement?.name);

  const handleElementDrag = useCallback((elementId: string, x: number, y: number) => {
    console.log('[Page] handleElementDrag called:', { elementId, x, y });
    
    // Always get latest model from store to avoid stale state
    const currentModel = modelStore.getState().model;
    if (!currentModel) {
      console.log('[Page] No current model');
      return;
    }

    const updatedView = currentModel.views[0];
    if (!updatedView) {
      console.log('[Page] No updated view');
      return;
    }

    // Update the node position in the layout
    const nodeIndex = updatedView.layout.nodes.findIndex(n => n.elementId === elementId);
    console.log('[Page] Found node at index:', nodeIndex);
    
    if (nodeIndex >= 0) {
      updatedView.layout.nodes[nodeIndex]!.x = x;
      updatedView.layout.nodes[nodeIndex]!.y = y;

      modelStore.updateModel({
        ...currentModel,
        views: currentModel.views,
      });
      console.log('[Page] Updated model with new position');
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
    }
  };

  const currentView = model?.views[0];
  const isDirty = modelStore.getState().isDirty;

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
          {model && currentView && (
            <MapCanvas
              model={{...model, elements: visibleElements}}
              view={currentView}
              onElementClick={handleElementClick}
              onElementDoubleClick={handleElementDoubleClick}
              onElementDrag={handleElementDrag}
            />
          )}
        </main>
        <aside className="studio-sidebar">
          {editingElement && (
            <ElementEditor
              element={editingElement}
              onSave={handleSaveElement}
              onCancel={() => setEditingElement(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
