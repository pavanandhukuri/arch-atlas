'use client';

import { useState } from 'react';
import type { ElementKind } from '@arch-atlas/core-model';
import type { DiagramLevel } from '@/services/diagram-context';
import { getElementKindForLevel, getLevelIcon } from '@/services/diagram-context';

interface ElementPaletteProps {
  currentLevel: DiagramLevel;
  onAddElement: (kind: ElementKind) => void;
  onNavigateUp?: () => void;
  canNavigateUp: boolean;
}

export function ElementPalette({ currentLevel, onAddElement, onNavigateUp, canNavigateUp }: ElementPaletteProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const elementKind = getElementKindForLevel(currentLevel);
  const icon = getLevelIcon(currentLevel);
  
  const elementLabels: Record<ElementKind, string> = {
    landscape: 'Landscape',
    system: 'System',
    container: 'Container',
    component: 'Component',
    code: 'Code Element',
  };

  return (
    <div className="element-palette">
      <div className="palette-header">
        <h3>Add Element</h3>
        <button
          className="toggle-button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Collapse palette' : 'Expand palette'}
        >
          {isExpanded ? '◀' : '▶'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="palette-content">
          {canNavigateUp && onNavigateUp && (
            <button
              className="navigate-up-button"
              onClick={onNavigateUp}
              title="Go to parent diagram"
            >
              <span className="navigate-icon">↑</span>
              <span className="navigate-label">Up to Parent</span>
            </button>
          )}
          
          <div className="current-level-info">
            <span className="level-icon">{icon}</span>
            <span className="level-name">{currentLevel}</span>
          </div>
          
          <button
            className="palette-item-single"
            onClick={() => onAddElement(elementKind)}
            title={`Add ${elementLabels[elementKind]}`}
          >
            <span className="palette-icon">{getLevelIcon(elementKind as DiagramLevel)}</span>
            <span className="palette-label">Add {elementLabels[elementKind]}</span>
          </button>
        </div>
      )}
    </div>
  );
}

