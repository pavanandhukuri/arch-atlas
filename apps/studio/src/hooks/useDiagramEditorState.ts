'use client';

/**
 * useDiagramEditorState — owns which element or relationship is currently selected/being
 * edited on the canvas, and the handlers that mutate the model in response to user actions
 * (add/save/delete elements, create/edit/delete relationships, mark-external).
 */

import { useCallback, useState } from 'react';
import type {
  ArchitectureModel,
  ContainerSubtype,
  Element,
  ElementFormatting,
  ElementKind,
  Relationship,
} from '@archatlas/core-model';
import type { ModelStore } from '../state/model-store';
import type { DiagramLevel } from '../services/diagram-context';
import { canDrillDown, getChildLevel } from '../services/diagram-context';
import {
  addContainerElementToModel,
  addElementToModel,
  deleteElementCascade,
  saveElementToModel,
} from '../services/elements';
import {
  addRelationshipToModel,
  removeRelationshipFromModel,
  saveRelationshipToModel,
} from '../services/relationships';
import { applyMarkExternal, collectDescendantIds } from '../services/mark-external';

export interface UseDiagramEditorStateOptions {
  model: ArchitectureModel | null;
  modelStore: ModelStore;
  focusedElementId: string | null;
  currentLevel: DiagramLevel;
  navigateToLevel: (level: DiagramLevel, focusId?: string | null) => void;
}

export interface DiagramEditorState {
  editingElement: Element | null;
  selectedRelationshipId: string | null;
  pendingNewRelationship: Relationship | null;
  connectionStartId: string | null;
  /** Closes whichever editor panel (element or relationship) is currently open. */
  closeEditors: () => void;
  handleAddContainerSubtype: (subtype: ContainerSubtype) => void;
  handleAddElement: (kind: ElementKind) => void;
  handleSaveElement: (element: Element) => void;
  handleElementClick: (elementId: string) => void;
  handleElementDoubleClick: (elementId: string) => void;
  handleMarkExternal: (elementId: string, isExternal: boolean) => void;
  handleConnectionStart: (elementId: string) => void;
  handleRelationshipClick: (relationshipId: string) => void;
  handleDeleteElement: (elementId: string) => void;
  handleSaveRelationship: (relationship: Relationship) => void;
  handleDeleteRelationship: () => void;
  handleCancelRelationshipEdit: () => void;
  handleEditRelationshipFromElement: (relationship: Relationship) => void;
  handleAddRelationshipFromElement: (sourceElementId: string) => void;
  handleFormatChange: (elementId: string, formatting: ElementFormatting | undefined) => void;
}

export function useDiagramEditorState({
  model,
  modelStore,
  focusedElementId,
  currentLevel,
  navigateToLevel,
}: UseDiagramEditorStateOptions): DiagramEditorState {
  const [editingElement, setEditingElement] = useState<Element | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [pendingNewRelationship, setPendingNewRelationship] = useState<Relationship | null>(null);
  // Remember which element we opened the relationship editor from (so we can go back).
  const [elementBeforeConnection, setElementBeforeConnection] = useState<Element | null>(null);
  const [connectionStartId, setConnectionStartId] = useState<string | null>(null);

  const closeEditors = useCallback(() => {
    setEditingElement(null);
    setSelectedRelationshipId(null);
    setPendingNewRelationship(null);
  }, []);

  const handleAddContainerSubtype = useCallback(
    (subtype: ContainerSubtype) => {
      if (!model) return;
      const { model: updated, newElement } = addContainerElementToModel(
        model,
        subtype,
        focusedElementId
      );
      modelStore.updateModel(updated);
      setEditingElement(newElement);
    },
    [model, focusedElementId, modelStore]
  );

  const handleAddElement = useCallback(
    (kind: ElementKind) => {
      if (!model) return;
      const { model: updated, newElement } = addElementToModel(model, kind, focusedElementId);
      modelStore.updateModel(updated);
      setEditingElement(newElement);
    },
    [model, focusedElementId, modelStore]
  );

  const handleSaveElement = useCallback(
    (element: Element) => {
      if (!model) return;
      modelStore.updateModel(saveElementToModel(model, element));
      setEditingElement(null);
    },
    [model, modelStore]
  );

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
    [modelStore, connectionStartId]
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
    [currentLevel, navigateToLevel, connectionStartId, focusedElementId, modelStore]
  );

  const handleMarkExternal = useCallback(
    (elementId: string, isExternal: boolean) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;

      // Marking external deletes the element's entire descendant subtree (spec 003 FR-004/005) —
      // warn and require explicit confirmation whenever there's anything to lose. No warning when
      // there's nothing underneath (FR-007), and none when reverting to internal (FR-006).
      if (isExternal) {
        const descendantCount = collectDescendantIds(currentModel, elementId).length;
        if (descendantCount > 0) {
          const confirmed = confirm(
            `Marking this system as external will permanently delete ${descendantCount} ` +
              `contained element${descendantCount === 1 ? '' : 's'} (containers, components, ` +
              `or code) underneath it. This cannot be undone.\n\nContinue?`
          );
          if (!confirmed) return;
        }
      }

      const { model: updatedModel } = applyMarkExternal(currentModel, elementId, isExternal);
      modelStore.updateModel(updatedModel);

      // Auto-save: close the editor — change is already persisted in model
      setEditingElement(null);
    },
    [modelStore]
  );

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

  const handleDeleteElement = useCallback(
    (elementId: string) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;
      modelStore.updateModel(deleteElementCascade(currentModel, elementId));
      setEditingElement(null);
    },
    [modelStore]
  );

  const handleSaveRelationship = useCallback(
    (relationship: Relationship) => {
      const currentModel = modelStore.getState().model;
      if (!currentModel) return;

      modelStore.updateModel(saveRelationshipToModel(currentModel, relationship));
      setSelectedRelationshipId(null);
      setPendingNewRelationship(null);

      // Return to the element editor if we came from one (e.g. via the connections table)
      if (elementBeforeConnection) {
        const refreshed =
          modelStore.getState().model?.elements.find((e) => e.id === elementBeforeConnection.id) ??
          elementBeforeConnection;
        setEditingElement(refreshed);
        setElementBeforeConnection(null);
      }
    },
    [modelStore, elementBeforeConnection]
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
  }, [modelStore, selectedRelationshipId, elementBeforeConnection]);

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
    [modelStore]
  );

  return {
    editingElement,
    selectedRelationshipId,
    pendingNewRelationship,
    connectionStartId,
    closeEditors,
    handleAddContainerSubtype,
    handleAddElement,
    handleSaveElement,
    handleElementClick,
    handleElementDoubleClick,
    handleMarkExternal,
    handleConnectionStart,
    handleRelationshipClick,
    handleDeleteElement,
    handleSaveRelationship,
    handleDeleteRelationship,
    handleCancelRelationshipEdit,
    handleEditRelationshipFromElement,
    handleAddRelationshipFromElement,
    handleFormatChange,
  };
}
