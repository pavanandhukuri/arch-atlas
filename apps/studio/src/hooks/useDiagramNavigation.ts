'use client';

/**
 * useDiagramNavigation — owns the current diagram level/focus (synced to the URL's
 * `level`/`focus` query params), the breadcrumb trail, and the page/document title.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ArchitectureModel, Element } from '@archatlas/core-model';
import type { DiagramLevel } from '../services/diagram-context';
import { buildBreadcrumbs, type Breadcrumb } from '../services/diagram-context';

export interface DiagramNavigation {
  currentLevel: DiagramLevel;
  focusedElementId: string | null;
  focusedElement: Element | null;
  breadcrumbs: Breadcrumb[];
  diagramTitle: string;
  navigateToLevel: (level: DiagramLevel, focusId?: string | null) => void;
}

function computeDiagramTitle(level: DiagramLevel, name: string | undefined): string {
  switch (level) {
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
}

export function useDiagramNavigation(model: ArchitectureModel | null): DiagramNavigation {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const levelParam = searchParams.get('level') as DiagramLevel | null;
  const focusParam = searchParams.get('focus');
  const [currentLevel, setCurrentLevel] = useState<DiagramLevel>(levelParam || 'landscape');
  const [focusedElementId, setFocusedElementId] = useState<string | null>(focusParam || null);

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
      updateURL(level, focusId);
    },
    [updateURL]
  );

  const focusedElement = focusedElementId
    ? (model?.elements.find((e) => e.id === focusedElementId) ?? null)
    : null;

  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(model, currentLevel, focusedElementId),
    [model, currentLevel, focusedElementId]
  );

  const diagramTitle = computeDiagramTitle(currentLevel, focusedElement?.name);

  // Run after every navigation (searchParams dep) so we override Next.js's
  // static-metadata title reset that happens during soft navigation.
  useEffect(() => {
    if (!model) return;
    document.title = model.metadata.title
      ? `${diagramTitle} · ${model.metadata.title}`
      : `${diagramTitle} · Arch Atlas`;
  }, [diagramTitle, model, searchParams]);

  return {
    currentLevel,
    focusedElementId,
    focusedElement,
    breadcrumbs,
    diagramTitle,
    navigateToLevel,
  };
}
