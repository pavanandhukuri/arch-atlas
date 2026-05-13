import { useState, useEffect } from 'react';
import { DiagramViewer } from '@arch-atlas/viewer-components';
import { DiagramPicker } from './components/DiagramPicker';
import type { DiagramManifestEntry } from './components/DiagramPicker';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

type AppState =
  | { phase: 'loading-manifest' }
  | { phase: 'picking'; manifest: DiagramManifestEntry[] }
  | { phase: 'loading-diagram'; manifest: DiagramManifestEntry[]; entry: DiagramManifestEntry }
  | {
      phase: 'viewing';
      manifest: DiagramManifestEntry[];
      entry: DiagramManifestEntry;
      model: ArchitectureModel;
      view: View;
    }
  | {
      phase: 'error-diagram';
      manifest: DiagramManifestEntry[];
      entry: DiagramManifestEntry;
      message: string;
    };

export function App() {
  const [state, setState] = useState<AppState>({ phase: 'loading-manifest' });

  useEffect(() => {
    fetch('./diagrams/manifest.json')
      .then((r) => r.json() as Promise<DiagramManifestEntry[]>)
      .then((manifest) => setState({ phase: 'picking', manifest }))
      .catch(() => setState({ phase: 'picking', manifest: [] }));
  }, []);

  const handleSelect = (manifest: DiagramManifestEntry[], entry: DiagramManifestEntry) => {
    setState({ phase: 'loading-diagram', manifest, entry });
    fetch(`./diagrams/${entry.file}`)
      .then((r) => r.text())
      .then((text) => {
        const model = JSON.parse(text) as ArchitectureModel;
        const view = model.views[0];
        if (!view) throw new Error('No views in model');
        setState({ phase: 'viewing', manifest, entry, model, view });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Could not load diagram.';
        setState({ phase: 'error-diagram', manifest, entry, message });
      });
  };

  const handleBack = (manifest: DiagramManifestEntry[]) => {
    setState({ phase: 'picking', manifest });
  };

  if (state.phase === 'loading-manifest') {
    return <div style={fullPage}>Loading…</div>;
  }

  if (state.phase === 'picking') {
    return (
      <DiagramPicker manifest={state.manifest} onSelect={(e) => handleSelect(state.manifest, e)} />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          aria-label="Back to diagram list"
          onClick={() => handleBack(state.manifest)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: '#555',
          }}
        >
          ← Back
        </button>
        <span style={{ fontWeight: 600 }}>{state.entry.title}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {state.phase === 'loading-diagram' && <DiagramViewer model={null} view={null} isLoading />}
        {state.phase === 'error-diagram' && (
          <DiagramViewer model={null} view={null} error={state.message} />
        )}
        {state.phase === 'viewing' && <DiagramViewer model={state.model} view={state.view} />}
      </div>
    </div>
  );
}

const fullPage: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#888',
};
