'use client';

import type { ElementKind } from '@arch-atlas/core-model';
import type { DiagramLevel } from '@/services/diagram-context';
import { getElementKindForLevel, getLevelIcon } from '@/services/diagram-context';

interface ElementPaletteProps {
  currentLevel: DiagramLevel;
  onAddElement: (kind: ElementKind) => void;
}

const elementLabels: Record<ElementKind, string> = {
  landscape: 'Landscape',
  system: 'System',
  person: 'User',
  container: 'Container',
  component: 'Component',
  code: 'Code Element',
};

export function ElementPalette({ currentLevel, onAddElement }: ElementPaletteProps) {
  const elementKind = getElementKindForLevel(currentLevel);
  const levelIcon = getLevelIcon(currentLevel);
  const showUserButton = currentLevel === 'landscape' || currentLevel === 'system' || currentLevel === 'container';

  return (
    <div className="element-palette">
      <div className="palette-level-indicator" title={`Current level: ${currentLevel}`}>
        {levelIcon}
      </div>

      <div className="palette-divider" />

      <button
        className="palette-icon-btn palette-icon-btn--add"
        onClick={() => onAddElement(elementKind)}
        title={`Add ${elementLabels[elementKind]}`}
      >
        +
      </button>

      {showUserButton && (
        <button
          className="palette-icon-btn"
          onClick={() => onAddElement('person')}
          title="Add User"
        >
          👤
        </button>
      )}
    </div>
  );
}
