import type React from 'react';

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  zoomLevel: number;
}

export function ZoomControls({ onZoomIn, onZoomOut, onFitToView, zoomLevel }: ZoomControlsProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(30,30,30,0.8)',
        borderRadius: 6,
        padding: '4px 8px',
        userSelect: 'none',
      }}
    >
      <button aria-label="Zoom out" onClick={onZoomOut} style={buttonStyle}>
        −
      </button>
      <span
        aria-live="polite"
        style={{ color: '#fff', fontSize: 13, minWidth: 40, textAlign: 'center' }}
      >
        {Math.round(zoomLevel * 100)}%
      </span>
      <button aria-label="Zoom in" onClick={onZoomIn} style={buttonStyle}>
        +
      </button>
      <button
        aria-label="Fit to view"
        onClick={onFitToView}
        style={{ ...buttonStyle, marginLeft: 4, fontSize: 11 }}
      >
        ⊡
      </button>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '2px 6px',
  borderRadius: 4,
};
