// Diagram level management for semantic zoom

import type { ElementKind } from '@arch-atlas/core-model';

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
    landscape: 'system',    // In landscape, we add systems
    system: 'container',     // In system context, we add containers
    container: 'component',  // In container diagram, we add components
    component: 'code',       // In component diagram, we add code
    code: 'code',           // In code diagram, we add code (leaf level)
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
