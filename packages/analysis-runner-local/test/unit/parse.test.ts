import { describe, expect, it } from 'vitest';
import { extractJsonObject, coerceModelAnalysis, parseLenient } from '../../src/parse.js';

const VALID = {
  description: 'a service',
  languages: ['Go'],
  frameworks: ['Gin'],
  served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
  outbound: [],
};

describe('extractJsonObject', () => {
  it('pulls a JSON object out of surrounding prose and code fences', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify(VALID) + '\n```\nHope that helps!';
    expect(extractJsonObject(text)).toEqual(VALID);
  });

  it('closes a truncated object', () => {
    const text = '{"description":"x","languages":["Go"],"frameworks":[';
    const out = extractJsonObject(text) as Record<string, unknown>;
    expect(out.description).toBe('x');
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });

  it('parseLenient strips trailing commas and // comments', () => {
    expect(parseLenient('{"a":1, /* c */ "b":2,}')).toEqual({ a: 1, b: 2 });
  });

  it('parseLenient returns undefined when even the repaired text is not JSON', () => {
    expect(parseLenient('{definitely not json')).toBeUndefined();
  });
});

describe('coerceModelAnalysis', () => {
  it('accepts a strictly valid analysis (partial: false)', () => {
    expect(coerceModelAnalysis(VALID)).toEqual({ model: VALID, partial: false });
  });

  it('salvages a partially-broken analysis (partial: true)', () => {
    const broken = { ...VALID, served: 'oops', outbound: 'nope' };
    const { model, partial } = coerceModelAnalysis(broken);
    expect(partial).toBe(true);
    expect(model.served).toEqual({ httpRoutes: [], grpcServices: [], topics: [], datastores: [] });
    expect(model.description).toBe('a service');
  });

  it('throws when there is no usable signal at all', () => {
    expect(() => coerceModelAnalysis({ served: 5 })).toThrow();
  });
});
