// Diagram level management for semantic zoom

import type { ArchitectureModel, Element, ElementKind } from '@archatlas/core-model';

export type DiagramLevel = 'landscape' | 'system' | 'container' | 'component' | 'code';

export interface DiagramContext {
  level: DiagramLevel;
  focusedElementId?: string; // When drilling down, which element we're focused on
}

export const DIAGRAM_HIERARCHY: DiagramLevel[] = [
  'landscape',
  'system',
  'container',
  'component',
  'code',
];

export function getDiagramTitle(level: DiagramLevel, elementName?: string): string {
  const titles: Record<DiagramLevel, string> = {
    landscape: 'System Landscape',
    system: 'System Context',
    container: 'Container Diagram',
    component: 'Component Diagram',
    code: 'Code Diagram',
  };

  const baseTitle = titles[level];
  return elementName ? `${baseTitle}: ${elementName}` : baseTitle;
}

export function getElementKindForLevel(level: DiagramLevel): ElementKind {
  const mapping: Record<DiagramLevel, ElementKind> = {
    landscape: 'system', // In landscape, we add systems
    system: 'container', // In system context, we add containers
    container: 'component', // In container diagram, we add components
    component: 'code', // In component diagram, we add code
    code: 'code', // In code diagram, we add code (leaf level)
  };
  return mapping[level];
}

export function canDrillDown(level: DiagramLevel): boolean {
  return level !== 'code'; // Can't drill down from code level
}

export function canDrillUp(level: DiagramLevel): boolean {
  return level !== 'landscape'; // Can't drill up from landscape
}

export function getParentLevel(level: DiagramLevel): DiagramLevel | null {
  const currentIndex = DIAGRAM_HIERARCHY.indexOf(level);
  if (currentIndex <= 0) return null;
  return DIAGRAM_HIERARCHY[currentIndex - 1]!;
}

export function getChildLevel(level: DiagramLevel): DiagramLevel | null {
  const currentIndex = DIAGRAM_HIERARCHY.indexOf(level);
  if (currentIndex >= DIAGRAM_HIERARCHY.length - 1) return null;
  return DIAGRAM_HIERARCHY[currentIndex + 1]!;
}

export function getLevelIcon(level: DiagramLevel): string {
  const icons: Record<DiagramLevel, string> = {
    landscape: '🌍',
    system: '📦',
    container: '🔲',
    component: '⬡',
    code: '📄',
  };
  return icons[level];
}

/** Elements that should render on the current diagram: a focused element's direct children,
 *  or — with nothing focused — the top-level elements for the current level. */
export function getVisibleElements(
  model: ArchitectureModel | null,
  level: DiagramLevel,
  focusedElementId: string | null
): Element[] {
  if (!model) return [];
  if (focusedElementId) return model.elements.filter((e) => e.parentId === focusedElementId);
  if (level === 'landscape') {
    return model.elements.filter((e) => e.kind === 'system' || e.kind === 'person');
  }
  const targetKind = getElementKindForLevel(level);
  return model.elements.filter((e) => e.kind === targetKind && !e.parentId);
}

export interface Breadcrumb {
  label: string;
  level: DiagramLevel;
  focusId: string | null;
}

/** Builds the breadcrumb trail from the landscape root down to the focused element. */
export function buildBreadcrumbs(
  model: ArchitectureModel | null,
  level: DiagramLevel,
  focusedElementId: string | null
): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [{ label: 'System Landscape', level: 'landscape', focusId: null }];
  if (level === 'landscape' || !focusedElementId || !model) return crumbs;

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
}

/** Label for the boundary box drawn around the focused element's children, e.g. "System Boundary: Checkout". */
export function getBoundaryLabel(focusedElement: Element | null | undefined): string | undefined {
  if (!focusedElement) return undefined;
  const kindLabel =
    focusedElement.kind === 'system'
      ? 'System'
      : focusedElement.kind === 'container'
        ? 'Container'
        : focusedElement.kind === 'landscape'
          ? 'Landscape'
          : focusedElement.kind.charAt(0).toUpperCase() + focusedElement.kind.slice(1);
  return `${kindLabel} Boundary: ${focusedElement.name}`;
}
