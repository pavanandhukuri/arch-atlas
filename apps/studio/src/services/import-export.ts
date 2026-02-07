import type { ArchitectureModel } from '@arch-atlas/core-model';

export function exportModel(model: ArchitectureModel): void {
  const json = JSON.stringify(model, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${model.metadata.title.toLowerCase().replace(/\s+/g, '-')}.arch.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function importModel(file: File): Promise<ArchitectureModel> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const model = JSON.parse(json) as ArchitectureModel;

        // Strict import policy: reject unknown schema versions
        if (!model.schemaVersion) {
          reject(new Error('Missing schemaVersion field'));
          return;
        }

        // In a real implementation, check against known versions
        const knownVersions = ['0.1.0'];
        if (!knownVersions.includes(model.schemaVersion)) {
          reject(new Error(`Unknown schemaVersion: ${model.schemaVersion}`));
          return;
        }

        // Reject unknown fields (simple check for top-level fields)
        const knownFields = ['schemaVersion', 'metadata', 'elements', 'relationships', 'constraints', 'views'];
        const actualFields = Object.keys(model);
        const unknownFields = actualFields.filter(f => !knownFields.includes(f));
        if (unknownFields.length > 0) {
          reject(new Error(`Unknown fields in model: ${unknownFields.join(', ')}`));
          return;
        }

        resolve(model);
      } catch (error) {
        reject(new Error(`Failed to parse JSON: ${error}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}
