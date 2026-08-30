import { describe, it, expect } from 'vitest';
import { mapToConfidenceBucket } from '../../src/confidence/bucket-mapper.js';

describe('mapToConfidenceBucket', () => {
  describe('agent-analysis source (no adjustment)', () => {
    it('maps weight >= 0.8 to high', () => {
      expect(mapToConfidenceBucket(0.8, 'agent-analysis')).toBe('high');
      expect(mapToConfidenceBucket(1.0, 'agent-analysis')).toBe('high');
    });
    it('maps 0.5 <= weight < 0.8 to medium', () => {
      expect(mapToConfidenceBucket(0.5, 'agent-analysis')).toBe('medium');
      expect(mapToConfidenceBucket(0.79, 'agent-analysis')).toBe('medium');
    });
    it('maps weight < 0.5 to low', () => {
      expect(mapToConfidenceBucket(0.49, 'agent-analysis')).toBe('low');
      expect(mapToConfidenceBucket(0, 'agent-analysis')).toBe('low');
    });
  });

  describe('deterministic-correlation source (bumped up one bucket, capped at high)', () => {
    it('bumps a medium base to high', () => {
      expect(mapToConfidenceBucket(0.6, 'deterministic-correlation')).toBe('high');
    });
    it('bumps a low base to medium', () => {
      expect(mapToConfidenceBucket(0.2, 'deterministic-correlation')).toBe('medium');
    });
    it('does not bump past high', () => {
      expect(mapToConfidenceBucket(0.95, 'deterministic-correlation')).toBe('high');
    });
  });

  describe('agentic-correlation-fallback source (capped at low — research.md D14.4)', () => {
    it('caps a would-be-high weight at low', () => {
      expect(mapToConfidenceBucket(0.95, 'agentic-correlation-fallback')).toBe('low');
    });
    it('caps a would-be-medium weight at low', () => {
      expect(mapToConfidenceBucket(0.6, 'agentic-correlation-fallback')).toBe('low');
    });
    it('leaves a low weight at low', () => {
      expect(mapToConfidenceBucket(0.1, 'agentic-correlation-fallback')).toBe('low');
    });
  });
});
