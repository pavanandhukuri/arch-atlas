'use client';

import React, { useRef } from 'react';
import type { Element, ElementKind, ElementFormatting } from '@arch-atlas/core-model';

interface PropertiesPanelProps {
  element: Element | null;
  onFormatChange: (elementId: string, formatting: ElementFormatting | undefined) => void;
}

type ColorField = 'backgroundColor' | 'borderColor' | 'fontColor';

const COLOR_SECTIONS: { field: ColorField; label: string }[] = [
  { field: 'backgroundColor', label: 'Background' },
  { field: 'borderColor', label: 'Border' },
  { field: 'fontColor', label: 'Font' },
];

// Matches the C4 color defaults in renderer.ts
const C4_DEFAULTS: Record<
  ElementKind,
  { backgroundColor: string; borderColor: string; fontColor: string }
> = {
  landscape: { backgroundColor: '#ffffff', borderColor: '#1168bd', fontColor: '#1168bd' },
  system: { backgroundColor: '#ffffff', borderColor: '#1168bd', fontColor: '#1168bd' },
  person: { backgroundColor: '#ffffff', borderColor: '#007580', fontColor: '#007580' },
  container: { backgroundColor: '#ffffff', borderColor: '#2574a9', fontColor: '#2574a9' },
  component: { backgroundColor: '#ffffff', borderColor: '#3a7ebf', fontColor: '#3a7ebf' },
  code: { backgroundColor: '#ffffff', borderColor: '#3a7ebf', fontColor: '#3a7ebf' },
};

export function PropertiesPanel({ element, onFormatChange }: PropertiesPanelProps) {
  const inputRefs = useRef<Partial<Record<ColorField, HTMLInputElement | null>>>({});

  if (!element || element.isExternal) return null;

  const defaults = C4_DEFAULTS[element.kind];

  const handleColorChange = (field: ColorField, color: string) => {
    onFormatChange(element.id, {
      ...element.formatting,
      [field]: color,
    });
  };

  const handleReset = () => {
    onFormatChange(element.id, undefined);
  };

  return (
    <div className="properties-panel">
      <h4 className="properties-panel__title">Formatting</h4>

      <div className="properties-panel__grid">
        {COLOR_SECTIONS.map(({ field, label }) => {
          const currentColor = element.formatting?.[field] ?? defaults[field];
          return (
            <React.Fragment key={field}>
              <span className="properties-panel__label">{label}</span>
              <span style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  data-field={field}
                  data-color={currentColor}
                  className="properties-panel__color-btn"
                  style={{ backgroundColor: currentColor }}
                  title={`Pick ${label.toLowerCase()} color (${currentColor})`}
                  onClick={() => inputRefs.current[field]?.click()}
                />
                <input
                  ref={(el) => {
                    inputRefs.current[field] = el;
                  }}
                  type="color"
                  value={currentColor}
                  style={{
                    position: 'absolute',
                    width: 0,
                    height: 0,
                    opacity: 0,
                    pointerEvents: 'none',
                    top: 0,
                    left: 0,
                  }}
                  onChange={(e) => handleColorChange(field, e.target.value)}
                />
              </span>
            </React.Fragment>
          );
        })}
      </div>

      <button className="properties-panel__reset" onClick={handleReset}>
        Reset to Default
      </button>
    </div>
  );
}
