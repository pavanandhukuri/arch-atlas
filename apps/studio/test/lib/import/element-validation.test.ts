import { describe, it, expect } from 'vitest';
import { isElementClassified } from '../../../src/lib/import/element-validation';
import type { ElementConfig } from '../../../src/lib/import/types';

function makeElement(overrides: Partial<ElementConfig>): ElementConfig {
  return {
    id: 'elem-1',
    name: 'Elem',
    displayName: 'Elem',
    kind: 'container',
    isExternal: false,
    tags: [],
    ...overrides,
  };
}

describe('isElementClassified', () => {
  it('container without a systemId is not classified', () => {
    expect(isElementClassified(makeElement({ kind: 'container', systemId: undefined }))).toBe(
      false
    );
  });

  it('container with a systemId is classified', () => {
    expect(isElementClassified(makeElement({ kind: 'container', systemId: 'sys-1' }))).toBe(true);
  });

  it('system not marked external is not classified', () => {
    expect(isElementClassified(makeElement({ kind: 'system', isExternal: false }))).toBe(false);
  });

  it('system marked external is classified', () => {
    expect(isElementClassified(makeElement({ kind: 'system', isExternal: true }))).toBe(true);
  });

  it('person is always classified regardless of other fields', () => {
    expect(isElementClassified(makeElement({ kind: 'person', isExternal: false }))).toBe(true);
  });
});
