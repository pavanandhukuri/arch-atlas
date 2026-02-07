import { describe, it, expect } from 'vitest';
import { importModel } from '../src/services/import-export';

describe('Import policy (strict)', () => {
  it('should reject model with unknown schemaVersion', async () => {
    const invalidModel = {
      schemaVersion: '999.0.0',
      metadata: {},
      elements: [],
      relationships: [],
      constraints: [],
      views: [],
    };

    const blob = new Blob([JSON.stringify(invalidModel)], { type: 'application/json' });
    const file = new File([blob], 'test.json');

    await expect(importModel(file)).rejects.toThrow('Unknown schemaVersion');
  });

  it('should reject model with missing schemaVersion', async () => {
    const invalidModel = {
      metadata: {},
      elements: [],
    };

    const blob = new Blob([JSON.stringify(invalidModel)], { type: 'application/json' });
    const file = new File([blob], 'test.json');

    await expect(importModel(file)).rejects.toThrow('Missing schemaVersion');
  });

  it('should reject model with unknown fields', async () => {
    const invalidModel = {
      schemaVersion: '0.1.0',
      metadata: {},
      elements: [],
      relationships: [],
      constraints: [],
      views: [],
      unknownField: 'invalid',
    };

    const blob = new Blob([JSON.stringify(invalidModel)], { type: 'application/json' });
    const file = new File([blob], 'test.json');

    await expect(importModel(file)).rejects.toThrow('Unknown fields');
  });
});
