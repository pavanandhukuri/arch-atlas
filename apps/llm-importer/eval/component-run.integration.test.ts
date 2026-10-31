import { describe, it, expect } from 'vitest';
import { listComponentGoldenSets, loadComponentGoldenSet } from './component-load.js';
import { scoreComponents, scoreRelationships } from './score.js';

/**
 * Two golden-components sets (014-component-layer-drilldown): the Bookshop
 * demo's `catalog-service` (Java/Spring Boot) and `order-service`
 * (TypeScript/Express) — reused, already-committed repos, not vendored.
 * Each committed `{repo}.components.json` is a deliberately imperfect
 * hand-authored stand-in (research.md #5): one omits a whole component, the
 * other reverses a relationship's direction — so this test proves the harness
 * actually discriminates (FR-005) before any real extraction procedure exists.
 */
describe('component eval — both golden-components sets', () => {
  it('discovers both sets', () => {
    expect(listComponentGoldenSets()).toEqual(['catalog-service', 'order-service']);
  });

  describe('catalog-service — missing a component, one relationship reversed', () => {
    const { groundTruth, artifact } = loadComponentGoldenSet('catalog-service');
    const components = scoreComponents(artifact.components, groundTruth.components);
    const relationships = scoreRelationships(artifact.relationships, groundTruth.relationships);

    it('components: recall drops for the omitted CoverStorage, no false positives', () => {
      expect(components.tp).toBe(2);
      expect(components.fp).toBe(0);
      expect(components.fn).toBe(1);
      expect(components.precision).toBe(1);
      expect(components.recall).toBeCloseTo(2 / 3, 5);
    });

    it('relationships: the reversed edge matches nothing', () => {
      expect(relationships.tp).toBe(0);
      expect(relationships.fp).toBe(1);
      expect(relationships.fn).toBe(2);
      expect(relationships.precision).toBe(0);
      expect(relationships.recall).toBe(0);
    });
  });

  describe('order-service — missing a component, one relationship reversed', () => {
    const { groundTruth, artifact } = loadComponentGoldenSet('order-service');
    const components = scoreComponents(artifact.components, groundTruth.components);
    const relationships = scoreRelationships(artifact.relationships, groundTruth.relationships);

    it('components: recall drops for the omitted EventPublisher, no false positives', () => {
      expect(components.tp).toBe(4);
      expect(components.fp).toBe(0);
      expect(components.fn).toBe(1);
      expect(components.precision).toBe(1);
      expect(components.recall).toBeCloseTo(0.8, 5);
    });

    it('relationships: two correct edges survive, the reversed one does not', () => {
      expect(relationships.tp).toBe(2);
      expect(relationships.fp).toBe(1);
      expect(relationships.fn).toBe(2);
      expect(relationships.precision).toBeCloseTo(2 / 3, 5);
      expect(relationships.recall).toBe(0.5);
    });
  });
});
