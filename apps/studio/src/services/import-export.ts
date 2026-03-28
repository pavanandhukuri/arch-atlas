import type { ArchitectureModel } from '@arch-atlas/core-model';

export function exportModel(model: ArchitectureModel): void {
  const json = JSON.stringify(model, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  const safeName = model.metadata.title
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'diagram';
  link.download = `${safeName}.arch.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function parseModelFromText(text: string): ArchitectureModel {
  const model = JSON.parse(text) as ArchitectureModel;

  if (!model.schemaVersion) {
    throw new Error('Missing schemaVersion field');
  }

  const knownVersions = ['0.1.0'];
  if (!knownVersions.includes(model.schemaVersion)) {
    throw new Error(`Unknown schemaVersion: ${model.schemaVersion}`);
  }

  const knownFields = ['schemaVersion', 'metadata', 'elements', 'relationships', 'constraints', 'views'];
  const unknownFields = Object.keys(model).filter(f => !knownFields.includes(f));
  if (unknownFields.length > 0) {
    throw new Error(`Unknown fields in model: ${unknownFields.join(', ')}`);
  }

  return model;
}

export async function importModel(file: File): Promise<ArchitectureModel> {
  const text = await file.text();
  return parseModelFromText(text);
}
