'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapCanvas } from '@/components/map-canvas';
import { ElementEditor, RelationshipEditor } from '@/components/model-editor';
import { ElementPalette } from '@/components/element-palette';
import { PropertiesPanel } from '@/components/properties-panel/PropertiesPanel';
import { ModelStore } from '@/state/model-store';
import { StorageManager } from '@/services/storage/storage-manager';
import { LocalFileProvider } from '@/services/storage/local-file-provider';
import { GoogleDriveProvider } from '@/services/storage/google-drive-provider';
import { useGoogleDriveAuth, type GoogleDriveAuthState } from '@/hooks/useGoogleDriveAuth';
import { StoragePromptDialog } from '@/components/storage/StoragePromptDialog';
import { ConnectionStatusBanner } from '@/components/storage/ConnectionStatusBanner';
import { ConflictResolutionDialog } from '@/components/storage/ConflictResolutionDialog';
import { useStorageSession } from '@/hooks/useStorageSession';
import { exportModel } from '@/services/import-export';
import type { StorageHandle, LoadResult } from '@/services/storage/storage-provider';
import { addRelationshipToModel, removeRelationshipFromModel } from '@/services/relationships';
import { deriveViewRelationships, buildElementOptions } from '@/services/derived-relationships';
import type {
  ArchitectureModel,
  Element,
  ElementKind,
  ContainerSubtype,
  ElementFormatting,
  Relationship,
} from '@arch-atlas/core-model';
import { computeLayout } from '@arch-atlas/layout';
import type { DiagramLevel } from '@/services/diagram-context';
import {
  getDiagramTitle,
  getElementKindForLevel,
  canDrillDown,
  getChildLevel,
} from '@/services/diagram-context';

const modelStore = new ModelStore();
const storageManager = new StorageManager();
const localProvider = new LocalFileProvider();

export default function StudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const driveAuth: GoogleDriveAuthState = useGoogleDriveAuth();

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
  const [showStoragePrompt, setShowStoragePrompt] = useState<'startup' | 'new' | 'open' | null>(
    null
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveStatusMessage, setSaveStatusMessage] = useState<string>('');
  const [conflictInfo, setConflictInfo] = useState<{
    remoteModified: string;
    clientLastKnown: string | number | null;
  } | null>(null);
  const { handle, setHandle, clearHandle } = useStorageSession();
  // Separate positions for external (system-level) elements so they don't share
  // coordinates with the element's position in the landscape/main view.
  // Keyed by elementId. Cleared whenever the user navigates to a new view.
  const [externalPositions, setExternalPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const levelParam = searchParams.get('level') as DiagramLevel | null;
  const focusParam = searchParams.get('focus');
  const [currentLevel, setCurrentLevel] = useState<DiagramLevel>(levelParam || 'landscape');
  const [focusedElementId, setFocusedElementId] = useState<string | null>(focusParam || null);
  const [, startTransition] = useTransition();

  const updateURL = useCallback(
    (level: DiagramLevel, focusId: string | null) => {
      const params = new URLSearchParams();
      params.set('level', level);
      if (focusId) params.set('focus', focusId);
      startTransition(() => {
        router.push(`?${params.toString()}`, { scroll: false });
      });
    },
    [router]
  );

  const navigateToLevel = useCallback(
    (level: DiagramLevel, focusId: string | null = null) => {
      setCurrentLevel(level);
      setFocusedElementId(focusId);
      setExternalPositions({}); // external coords are per-view
      setEditingElement(null);
      setSelectedRelationshipId(null);
      setPendingNewRelationship(null);
      updateURL(level, focusId);
    },
    [updateURL]
  );

  useEffect(() => {
    const unsubscribe = modelStore.subscribe((state) => {
      setModel(state.model);
    });
    // Hydrate immediately — after a router navigation the component remounts but the
    // module-level modelStore still holds the loaded model; subscribe() doesn't call
    // the listener retroactively, so we prime the state ourselves.
    setModel(modelStore.getState().model);

    setShowStoragePrompt('startup');

    // Subscribe to StorageManager events for save status
    const offSuccess = storageManager.on('save-success', () => {
      modelStore.clearDirty();
      setSaveStatus('saved');
      setSaveStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setSaveStatus('idle'), 3000);
    });
    const offError = storageManager.on('save-error', (e) => {
      setSaveStatus('error');
      setSaveStatusMessage(e.error?.message ?? 'Save failed');
    });
    const offConflict = storageManager.on('conflict', (e) => {
      if (e.error?.conflict) {
        setConflictInfo({
          remoteModified: String(e.error.conflict.remoteModified),
          clientLastKnown: e.error.conflict.clientLastKnown,
        });
      }
    });

    return () => {
      unsubscribe();
      offSuccess();
      offError();
      offConflict();
      storageManager.stopAutosave();
    };
  }, []);

  const handleAddContainerSubtype = (subtype: ContainerSubtype) => {
    if (!model) return;
    const labels: Record<ContainerSubtype, string> = {
      default: 'Container',
      database: 'Database',
      'storage-bucket': 'Storage Bucket',
      'static-content': 'Static Content',
      'user-interface': 'User Interface',
      'backend-service': 'Backend Service',
    };
    const newElement: Element = {
      id: `elem-${Date.now()}`,
      name: labels[subtype],
      kind: 'container',
      description: '',
      containerSubtype: subtype,
    };
    const updatedElements = [...model.elements];
    if (focusedElementId) {
      newElement.parentId = focusedElementId;
    }
    updatedElements.push(newElement);

    const currentView = model.views[0];
    const updatedViews = currentView
      ? [
          {
            ...currentView,
            layout: {
              ...currentView.layout,
              nodes: [
                ...currentView.layout.nodes,
                {
                  elementId: newElement.id,
                  x: 100 + updatedElements.length * 30,
                  y: 100 + updatedElements.length * 20,
                  w: 200,
                  h: 130,
                },
              ],
            },
          },
          ...model.views.slice(1),
        ]
      : model.views;

    modelStore.updateModel({ ...model, elements: updatedElements, views: updatedViews });
    setEditingElement(newElement);
  };

  const handleAddElement = (kind: ElementKind) => {
    if (!model) return;
    const newElement: Element = {
      id: `elem-${Date.now()}`,
      name: `New ${kind}`,
      kind,
      description: '',
    };
    const updatedElements = [...model.elements];

    if (focusedElementId) {
      newElement.parentId = focusedElementId;
      updatedElements.push(newElement);
    } else if (kind === 'system' || kind === 'person') {
      let landscape = model.elements.find((e) => e.kind === 'landscape' && !e.parentId);
      if (!landscape) {
        landscape = {
          id: `landscape-${Date.now()}`,
          name: 'Architecture Landscape',
          kind: 'landscape' as ElementKind,
          description: 'Top-level architecture landscape',
        };
        updatedElements.push(landscape);
      }
      newElement.parentId = landscape.id;
      updatedElements.push(newElement);
    } else {
      updatedElements.push(newElement);
    }

    const currentView = model.views[0];
    const updatedViews = currentView
      ? [
          {
            ...currentView,
            layout: {
              ...currentView.layout,
              nodes: [
                ...currentView.layout.nodes,
                {
                  elementId: newElement.id,
                  x: 100 + updatedElements.length * 30,
                  y: 100 + updatedElements.length * 20,
                  w: 200,
                  h: 130,
                },
              ],
            },
          },
          ...model.views.slice(1),
        ]
      : model.views;

    modelStore.updateModel({ ...model, elements: updatedElements, views: updatedViews });
    setEditingElement(newElement);
  };

  const handleSaveElement = (element: Element) => {
    if (!model) return;
    const isExisting = model.elements.some((e) => e.id === element.id);
    const updatedElements = isExisting
      ? model.elements.map((e) => (e.id === element.id ? element : e))
      : [...model.elements, { ...element, id: `elem-${Date.now()}` }];

    const currentView = model.views[0];
    const updatedViews =
      currentView && !isExisting
        ? [
            {
              ...currentView,
              layout: computeLayout({ ...model, elements: updatedElements }, currentView, {
                algorithm: 'deterministic-v1',
              }),
            },
            ...model.views.slice(1),
          ]
        : model.views;

    modelStore.updateModel({ ...model, elements: updatedElements, views: updatedViews });
    setEditingElement(null);
  };

  const handleElementClick = useCallback(
    (elementId: string) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;
      const element = currentModel.elements.find((e) => e.id === elementId);
      if (!element) return;

      if (connectionStartId) {
        if (connectionStartId !== elementId) {
          const currentView = currentModel.views[0];
          if (currentView) {
            modelStore.updateModel(
              addRelationshipToModel({
                model: currentModel,
                viewId: currentView.id,
                sourceId: connectionStartId,
                targetId: elementId,
                type: 'relates_to',
              })
            );
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
    },
    [connectionStartId]
  );

  const handleElementDoubleClick = useCallback(
    (elementId: string) => {
      if (connectionStartId) return;
      setEditingElement(null);
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;
      const element = currentModel.elements.find((e) => e.id === elementId);
      if (!element) return;

      // Org-external systems cannot be drilled into
      if (element.isExternal) return;

      // Scope-external elements (neighboring systems shown for context): navigate to their system diagram.
      const isScopeExternal =
        (element.kind === 'system' || element.kind === 'person') &&
        focusedElementId !== null &&
        element.parentId !== focusedElementId;
      if (isScopeExternal) {
        navigateToLevel('system', elementId);
        return;
      }

      if (canDrillDown(currentLevel)) {
        const childLevel = getChildLevel(currentLevel);
        if (childLevel) navigateToLevel(childLevel, elementId);
      }
    },
    [currentLevel, navigateToLevel, connectionStartId, focusedElementId]
  );

  const handleMarkExternal = useCallback((elementId: string, isExternal: boolean) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;

    if (isExternal) {
      // Mark as external — delete all descendants silently
      const toDelete = new Set<string>();
      const queue = currentModel.elements.filter((e) => e.parentId === elementId).map((e) => e.id);
      queue.forEach((id) => toDelete.add(id));
      while (queue.length > 0) {
        const id = queue.pop()!;
        currentModel.elements
          .filter((e) => e.parentId === id)
          .forEach((child) => {
            if (!toDelete.has(child.id)) {
              toDelete.add(child.id);
              queue.push(child.id);
            }
          });
      }
      const updatedElements = currentModel.elements
        .filter((e) => !toDelete.has(e.id))
        .map((e) => (e.id === elementId ? { ...e, isExternal: true, formatting: undefined } : e));
      const updatedRelationships = currentModel.relationships.filter(
        (r) => !toDelete.has(r.sourceId) && !toDelete.has(r.targetId)
      );
      const updatedViews = currentModel.views.map((v) => ({
        ...v,
        layout: {
          ...v.layout,
          nodes: v.layout.nodes.filter((n) => !toDelete.has(n.elementId)),
          edges: v.layout.edges.filter((edge) =>
            updatedRelationships.some((r) => r.id === edge.relationshipId)
          ),
        },
      }));
      modelStore.updateModel({
        ...currentModel,
        elements: updatedElements,
        relationships: updatedRelationships,
        views: updatedViews,
      });
    } else {
      // Unmark external
      const updatedElements = currentModel.elements.map((e) =>
        e.id === elementId ? { ...e, isExternal: false } : e
      );
      modelStore.updateModel({ ...currentModel, elements: updatedElements });
    }

    // Auto-save: close the editor — change is already persisted in model
    setEditingElement(null);
  }, []);

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

  const handleCancelConnection = useCallback(() => {
    setConnectionStartId(null);
  }, []);

  const handleDeleteElement = useCallback((elementId: string) => {
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    const toDelete = new Set<string>();
    const queue = [elementId];
    while (queue.length > 0) {
      const id = queue.pop()!;
      toDelete.add(id);
      currentModel.elements
        .filter((e) => e.parentId === id)
        .forEach((child) => queue.push(child.id));
    }
    const updatedElements = currentModel.elements.filter((e) => !toDelete.has(e.id));
    const updatedRelationships = currentModel.relationships.filter(
      (r) => !toDelete.has(r.sourceId) && !toDelete.has(r.targetId)
    );
    const updatedViews = currentModel.views.map((v) => ({
      ...v,
      layout: {
        ...v.layout,
        nodes: v.layout.nodes.filter((n) => !toDelete.has(n.elementId)),
        edges: v.layout.edges.filter((edge) =>
          updatedRelationships.some((r) => r.id === edge.relationshipId)
        ),
      },
    }));
    modelStore.updateModel({
      ...currentModel,
      elements: updatedElements,
      relationships: updatedRelationships,
      views: updatedViews,
    });
    setEditingElement(null);
  }, []);

  const handleSaveRelationship = useCallback(
    (relationship: Relationship) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;

      // Derived relationships are UI-only — update the original underlying relationship's metadata
      const originalId = (relationship as Relationship & { _originalId?: string })._originalId;
      if (originalId) {
        const updatedRelationships = currentModel.relationships.map((rel) =>
          rel.id === originalId
            ? {
                ...rel,
                sourceId: relationship.sourceId,
                targetId: relationship.targetId,
                action: relationship.action,
                integrationMode: relationship.integrationMode,
                description: relationship.description,
              }
            : rel
        );
        modelStore.updateModel({ ...currentModel, relationships: updatedRelationships });
        setSelectedRelationshipId(null);
        setPendingNewRelationship(null);
        if (elementBeforeConnection) {
          const refreshed =
            modelStore
              .getState()
              .model?.elements.find((e) => e.id === elementBeforeConnection.id) ??
            elementBeforeConnection;
          setEditingElement(refreshed);
          setElementBeforeConnection(null);
        }
        return;
      }

      const relToSave = relationship;
      const exists = currentModel.relationships.some((r) => r.id === relToSave.id);
      const updatedRelationships = exists
        ? currentModel.relationships.map((rel) => (rel.id === relToSave.id ? relToSave : rel))
        : [...currentModel.relationships, relToSave];

      // Ensure layout nodes exist for cross-layer endpoints
      const currentView = currentModel.views[0];
      let updatedViews = currentModel.views;
      if (currentView) {
        const existingNodeIds = new Set(currentView.layout.nodes.map((n) => n.elementId));
        const newNodes = [...currentView.layout.nodes];
        [relToSave.sourceId, relToSave.targetId].forEach((eid, i) => {
          if (eid && !existingNodeIds.has(eid)) {
            newNodes.push({ elementId: eid, x: 600 + i * 250, y: 80, w: 200, h: 130 });
          }
        });
        updatedViews = [
          { ...currentView, layout: { ...currentView.layout, nodes: newNodes } },
          ...currentModel.views.slice(1),
        ];
      }

      modelStore.updateModel({
        ...currentModel,
        relationships: updatedRelationships,
        views: updatedViews,
      });
      setSelectedRelationshipId(null);
      setPendingNewRelationship(null);

      // Return to element editor if we came from one
      if (elementBeforeConnection) {
        const refreshed =
          modelStore.getState().model?.elements.find((e) => e.id === elementBeforeConnection.id) ??
          elementBeforeConnection;
        setEditingElement(refreshed);
        setElementBeforeConnection(null);
      }
    },
    [elementBeforeConnection]
  );

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
  const handleEditRelationshipFromElement = useCallback(
    (relationship: Relationship) => {
      setElementBeforeConnection(editingElement);
      setEditingElement(null);
      setSelectedRelationshipId(relationship.id);
      setPendingNewRelationship(null);
    },
    [editingElement]
  );

  // From ElementEditor connections table: click "+ Add Connection"
  const handleAddRelationshipFromElement = useCallback(
    (sourceElementId: string) => {
      const stub: Relationship = {
        id: `rel-${Date.now()}`,
        sourceId: sourceElementId,
        targetId: '',
        type: 'relates_to',
      };
      setElementBeforeConnection(editingElement);
      setEditingElement(null);
      setSelectedRelationshipId(null);
      setPendingNewRelationship(stub);
    },
    [editingElement]
  );

  const getVisibleElements = (): Element[] => {
    if (!model) return [];
    if (focusedElementId) return model.elements.filter((e) => e.parentId === focusedElementId);
    if (currentLevel === 'landscape')
      return model.elements.filter((e) => e.kind === 'system' || e.kind === 'person');
    const targetKind = getElementKindForLevel(currentLevel);
    return model.elements.filter((e) => e.kind === targetKind && !e.parentId);
  };

  const visibleElements = getVisibleElements();
  const focusedElement = focusedElementId
    ? model?.elements.find((e) => e.id === focusedElementId)
    : null;
  const _diagramTitle = getDiagramTitle(currentLevel, focusedElement?.name);

  const breadcrumbs = useMemo(() => {
    type Crumb = { label: string; level: DiagramLevel; focusId: string | null };
    const crumbs: Crumb[] = [{ label: 'System Landscape', level: 'landscape', focusId: null }];
    if (currentLevel === 'landscape' || !focusedElementId || !model) return crumbs;

    // Walk up the parent chain from the focused element to build the full path
    const chain: { label: string; level: DiagramLevel; focusId: string }[] = [];
    let el = model.elements.find((e) => e.id === focusedElementId);
    while (el && el.kind !== 'landscape') {
      const levelForKind: Partial<Record<string, DiagramLevel>> = {
        system: 'system',
        container: 'container',
        component: 'component',
        code: 'code',
      };
      const lvl = levelForKind[el.kind];
      if (lvl) chain.unshift({ label: el.name, level: lvl, focusId: el.id });
      el = el.parentId ? model.elements.find((e) => e.id === el!.parentId) : undefined;
    }

    return [...crumbs, ...chain];
  }, [currentLevel, focusedElementId, model]);

  const diagramTitle = (() => {
    const name = focusedElement?.name;
    switch (currentLevel) {
      case 'landscape':
        return 'Architecture Landscape';
      case 'system':
        return name ? `System Context — ${name}` : 'System Context';
      case 'container':
        return name ? `Container Diagram — ${name}` : 'Container Diagram';
      case 'component':
        return name ? `Component Diagram — ${name}` : 'Component Diagram';
      case 'code':
        return name ? `Code Diagram — ${name}` : 'Code Diagram';
      default:
        return 'Diagram';
    }
  })();

  // Run after every navigation (searchParams dep) so we override Next.js's
  // static-metadata title reset that happens during soft navigation.
  useEffect(() => {
    if (!model) return;
    document.title = model.metadata.title
      ? `${diagramTitle} · ${model.metadata.title}`
      : `${diagramTitle} · Arch Atlas`;
  }, [diagramTitle, model, searchParams]);

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

  // The relationship shown in the sidebar editor (pending new creation takes priority)
  // Derived relationships (id: "derived-*") aren't in model.relationships, so fall back to viewRelationships
  const editorRelationship: Relationship | null =
    pendingNewRelationship ??
    (selectedRelationshipId
      ? (model?.relationships.find((r) => r.id === selectedRelationshipId) ??
        viewRelationships.find((r) => r.id === selectedRelationshipId) ??
        null)
      : null);

  const currentView = model?.views[0];
  const isDirty = modelStore.getState().isDirty;
  const elementOptions = model ? buildElementOptions(model) : [];

  const allViewElements = [...visibleElements, ...externalElements];
  const boundaryElementIds = visibleElements.map((e) => e.id);
  const externalElementIds = externalElements.map((e) => e.id);

  // Compute label for the boundary box (e.g. "System Boundary: My System")
  const boundaryLabel = focusedElement
    ? (() => {
        const kindLabel =
          focusedElement.kind === 'system'
            ? 'System'
            : focusedElement.kind === 'container'
              ? 'Container'
              : focusedElement.kind === 'landscape'
                ? 'Landscape'
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
      .map((id) => currentView.layout.nodes.find((n) => n.elementId === id))
      .filter(Boolean);
    if (boundaryNodes.length === 0) return 50;
    const minX = Math.min(...boundaryNodes.map((n) => n!.x));
    return minX - 280; // 200 wide + 80 gap
  })();

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
            // External elements use their dedicated externalPositions (or a stacked default)
            ...externalElements.map((el, i) => {
              const stored = externalPositions[el.id];
              return {
                elementId: el.id,
                x: stored?.x ?? defaultExternalX,
                y: stored?.y ?? 50 + i * 180,
                w: 200,
                h: 130,
              };
            }),
          ],
        },
      }
    : undefined;

  const handleElementDrag = useCallback((elementId: string, x: number, y: number) => {
    if (externalElementIdsRef.current.includes(elementId)) {
      // Store in separate externalPositions — does NOT touch the main layout
      setExternalPositions((prev) => ({ ...prev, [elementId]: { x, y } }));
      return;
    }
    // Regular element — update the main layout
    const currentModel = modelStore.getState().model;
    if (!currentModel) return;
    const currentView = currentModel.views[0];
    if (!currentView) return;
    const updatedNodes = currentView.layout.nodes.map((n) =>
      n.elementId === elementId ? { ...n, x, y } : n
    );
    modelStore.updateModel({
      ...currentModel,
      views: [
        { ...currentView, layout: { ...currentView.layout, nodes: updatedNodes } },
        ...currentModel.views.slice(1),
      ],
    });
  }, []);

  const handleFormatChange = useCallback(
    (elementId: string, formatting: ElementFormatting | undefined) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;
      const updatedElements = currentModel.elements.map((e) =>
        e.id === elementId ? { ...e, formatting } : e
      );
      modelStore.updateModel({ ...currentModel, elements: updatedElements });
      // Keep the editing element in sync
      const refreshed = updatedElements.find((e) => e.id === elementId);
      if (refreshed) setEditingElement(refreshed);
    },
    []
  );

  const handleExport = () => {
    if (model) {
      exportModel(model);
      modelStore.clearDirty();
    }
  };

  /** Open button — show StoragePromptDialog in open mode */
  const handleImportClick = () => {
    storageManager.stopAutosave();
    clearHandle();
    setShowStoragePrompt('open');
  };

  /** New button — stop current session and show StoragePromptDialog */
  const handleNewFile = () => {
    if (handle && modelStore.getState().isDirty) {
      if (!confirm('Create a new file? Unsaved changes will be lost.')) return;
    }
    storageManager.stopAutosave();
    clearHandle();

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
          layout: { algorithm: 'deterministic-v1', nodes: [], edges: [] },
        },
      ],
    };
    modelStore.loadModel(newModel);
    setModel(newModel);
    navigateToLevel('landscape', null);
    setShowStoragePrompt('new');
  };

  /** Manual Save */
  const handleManualSave = async () => {
    if (!handle || !model) return;
    setSaveStatus('saving');
    const provider =
      handle.type === 'local' ? localProvider : new GoogleDriveProvider(driveAuth.accessToken!);
    await storageManager.manualSave(handle, provider, model);
  };

  /** Keep My Version — force-overwrite remote with local state */
  const handleKeepMine = async () => {
    if (!handle || !model) return;
    const provider =
      handle.type === 'local' ? localProvider : new GoogleDriveProvider(driveAuth.accessToken!);
    setConflictInfo(null);
    await storageManager.manualSave(handle, provider, model, { force: true });
  };

  /** Load Remote Version — discard local changes and reload from storage */
  const handleLoadRemote = async () => {
    if (!handle) return;
    const provider =
      handle.type === 'local' ? localProvider : new GoogleDriveProvider(driveAuth.accessToken!);
    setConflictInfo(null);
    const result = await provider.load(handle);
    if (result.success) {
      modelStore.loadModel(result.model);
      setModel(result.model);
      handle.lastKnownModified = result.modified;
    }
  };

  /** Called when user selects a storage location from the dialog */
  const handleStorageSelected = (selectedHandle: StorageHandle, loadResult?: LoadResult) => {
    if (loadResult) {
      // Opening an existing file — load its model
      modelStore.loadModel(loadResult.model);
      setModel(loadResult.model);
      navigateToLevel('landscape', null);
    } else if (!modelStore.getState().model) {
      // New file from startup flow — no model has been created yet, initialize empty one
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
            layout: { algorithm: 'deterministic-v1', nodes: [], edges: [] },
          },
        ],
      };
      modelStore.loadModel(newModel);
      setModel(newModel);
    }

    setHandle(selectedHandle);
    setShowStoragePrompt(null);

    const provider =
      selectedHandle.type === 'local'
        ? localProvider
        : new GoogleDriveProvider(driveAuth.accessToken!);
    storageManager.startAutosave(
      selectedHandle,
      provider,
      () => modelStore.getState().model,
      () => modelStore.getState().isDirty
    );
  };

  const canvasModel = model
    ? { ...model, elements: allViewElements, relationships: viewRelationships }
    : null;

  return (
    <div className="studio-layout">
      {/* Connection status banner — shown when Google Drive is offline */}
      <ConnectionStatusBanner storageManager={storageManager} />

      {/* Conflict resolution dialog — shown when a save conflict is detected */}
      {conflictInfo && handle && (
        <ConflictResolutionDialog
          fileName={handle.fileName}
          localTimestamp={new Date().toISOString()}
          remoteTimestamp={conflictInfo.remoteModified}
          onKeepMine={handleKeepMine}
          onLoadRemote={handleLoadRemote}
        />
      )}

      {/* Storage location prompt — modal, shown on app init, New, and Open */}
      {showStoragePrompt && (
        <StoragePromptDialog
          mode={showStoragePrompt}
          onLocalSelected={handleStorageSelected}
          onDriveSelected={handleStorageSelected}
          driveAuth={driveAuth}
        />
      )}

      <header className="studio-header">
        <div className="header-left">
          <h1>Arch Atlas Studio</h1>
          <nav className="breadcrumb" aria-label="Diagram navigation">
            {breadcrumbs.map((crumb, i) => {
              const isCurrent = i === breadcrumbs.length - 1;
              return (
                <span key={`${crumb.level}-${crumb.focusId}`} className="breadcrumb-item">
                  {i > 0 && <span className="breadcrumb-sep">›</span>}
                  {isCurrent ? (
                    <span className="breadcrumb-current">{crumb.label}</span>
                  ) : (
                    <button
                      className="breadcrumb-link"
                      onClick={() => navigateToLevel(crumb.level, crumb.focusId)}
                    >
                      {crumb.label}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        </div>
        <div className="header-actions">
          {saveStatus !== 'idle' && (
            <span
              style={{
                fontSize: '0.8rem',
                color: saveStatus === 'error' ? '#dc2626' : '#16a34a',
                marginRight: 8,
              }}
              aria-live="polite"
            >
              {saveStatus === 'saving' ? 'Saving…' : saveStatusMessage}
            </span>
          )}
          <button onClick={handleNewFile}>New</button>
          <button onClick={handleImportClick}>Open</button>
          <button onClick={handleManualSave} disabled={!handle || !model}>
            Save {isDirty && handle ? '*' : ''}
          </button>
          <button onClick={handleExport} disabled={!model}>
            Export
          </button>
        </div>
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
          onAddContainerSubtype={handleAddContainerSubtype}
        />
        <main className="studio-canvas">
          {model && <div className="canvas-title">{diagramTitle}</div>}
          {canvasModel && filteredView && (
            <MapCanvas
              model={canvasModel}
              view={filteredView}
              onElementClick={handleElementClick}
              onElementDoubleClick={handleElementDoubleClick}
              onElementDrag={handleElementDrag}
              onConnectionStart={handleConnectionStart}
              onRelationshipClick={handleRelationshipClick}
              onBackgroundClick={() => {
                setEditingElement(null);
                setSelectedRelationshipId(null);
                setPendingNewRelationship(null);
              }}
              connectionStartId={connectionStartId}
              boundaryElementIds={boundaryElementIds}
              externalElementIds={externalElementIds}
              boundaryLabel={boundaryLabel}
            />
          )}
        </main>
        {(editingElement ?? editorRelationship) && (
          <aside className="studio-sidebar">
            <button
              className="sidebar-close-btn"
              onClick={() => {
                setEditingElement(null);
                setSelectedRelationshipId(null);
                setPendingNewRelationship(null);
              }}
              title="Close panel"
            >
              ✕
            </button>
            {editingElement && (
              <>
                <ElementEditor
                  element={editingElement}
                  allElements={model?.elements ?? []}
                  relationships={model?.relationships ?? []}
                  onSave={handleSaveElement}
                  onDelete={handleDeleteElement}
                  onCancel={() => setEditingElement(null)}
                  onEditRelationship={handleEditRelationshipFromElement}
                  onAddRelationship={handleAddRelationshipFromElement}
                  onMarkExternal={handleMarkExternal}
                />
                <PropertiesPanel element={editingElement} onFormatChange={handleFormatChange} />
              </>
            )}
            {!editingElement && editorRelationship && (
              <RelationshipEditor
                relationship={editorRelationship}
                sourceElementName={
                  model?.elements.find((e) => e.id === editorRelationship.sourceId)?.name
                }
                targetElementName={
                  model?.elements.find((e) => e.id === editorRelationship.targetId)?.name
                }
                elementOptions={elementOptions}
                onSave={handleSaveRelationship}
                onDelete={handleDeleteRelationship}
                onCancel={handleCancelRelationshipEdit}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
