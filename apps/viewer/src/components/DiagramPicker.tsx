export interface DiagramManifestEntry {
  id: string;
  title: string;
  file: string;
}

interface DiagramPickerProps {
  manifest: DiagramManifestEntry[];
  onSelect: (entry: DiagramManifestEntry) => void;
}

export function DiagramPicker({ manifest, onSelect }: DiagramPickerProps) {
  if (manifest.length === 0) {
    return (
      <div style={centreStyle}>
        <p style={{ color: '#888' }}>No diagrams available.</p>
      </div>
    );
  }

  return (
    <div style={centreStyle}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Architecture Diagrams</h1>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {manifest.map((entry) => (
          <li key={entry.id}>
            <button onClick={() => onSelect(entry)} style={itemStyle}>
              {entry.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const centreStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: 32,
};

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: 320,
  padding: '14px 20px',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 16,
  textAlign: 'left',
};
