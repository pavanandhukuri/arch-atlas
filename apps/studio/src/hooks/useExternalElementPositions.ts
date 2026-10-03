'use client';

/**
 * useExternalElementPositions — tracks where the user has dragged external (scope-external)
 * elements to, per view. These positions are UI-only: they never touch the model's stored
 * layout, so dragging an external element can't be mistaken for an edit to the diagram itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArchitectureModel } from '@archatlas/core-model';
import { ModelStore } from '../state/model-store';

export interface Point {
  x: number;
  y: number;
}

export interface ExternalElementPositions {
  /** Positions dragged-to by the user for the current view, keyed by elementId. */
  externalPositions: Record<string, Point>;
  /**
   * Drag handler: routes external-element drags into this hook's view-scoped position map,
   * and all other (regular, in-model) element drags into the model's view layout.
   */
  handleElementDrag: (elementId: string, x: number, y: number) => void;
}

export function useExternalElementPositions(
  modelStore: ModelStore,
  diagramIdentity: string,
  externalViewKey: string,
  externalElementIds: string[]
): ExternalElementPositions {
  const [externalPositionsByView, setExternalPositionsByView] = useState<
    Record<string, Record<string, Point>>
  >({});

  // A different diagram (new import / opened file) must not inherit the old one's drags.
  useEffect(() => {
    setExternalPositionsByView({});
  }, [diagramIdentity]);

  // Keep stable refs so handleElementDrag can check without a stale closure.
  const externalElementIdsRef = useRef(externalElementIds);
  externalElementIdsRef.current = externalElementIds;
  const externalViewKeyRef = useRef(externalViewKey);
  externalViewKeyRef.current = externalViewKey;

  const handleElementDrag = useCallback(
    (elementId: string, x: number, y: number) => {
      if (externalElementIdsRef.current.includes(elementId)) {
        setExternalPositionsByView((prev) => ({
          ...prev,
          [externalViewKeyRef.current]: {
            ...prev[externalViewKeyRef.current],
            [elementId]: { x, y },
          },
        }));
        return;
      }
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
      } satisfies ArchitectureModel);
    },
    [modelStore]
  );

  return {
    externalPositions: externalPositionsByView[externalViewKey] ?? {},
    handleElementDrag,
  };
}
