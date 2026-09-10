import { describe, it, expect } from 'vitest';
import { baselineEntry, diffBaseline, NOISE_FLOOR, toLiteRounded, TOLERANCE } from './baseline.js';
import type { Baseline, CorrelationReport, PRF } from './types.js';

const prf = (precision: number, recall: number, f1: number): PRF => ({
  tp: 0,
  fp: 0,
  fn: 0,
  precision,
  recall,
  f1,
});

const report = (
  set: string,
  connections: PRF,
  externalSystems: PRF = prf(1, 1, 1)
): CorrelationReport => ({
  set,
  generatedAt: '',
  connections,
  externalSystems,
  expected: { connections: [], externalSystems: [] },
  predicted: { connections: [], externalSystems: [] },
});

const baseline = (
  set: string,
  conn: [number, number, number],
  ext: [number, number, number] = [1, 1, 1]
): Baseline => ({
  [set]: {
    connections: { precision: conn[0], recall: conn[1], f1: conn[2] },
    externalSystems: { precision: ext[0], recall: ext[1], f1: ext[2] },
  },
});

describe('toLiteRounded', () => {
  it('keeps only P/R/F1 and rounds to 4 dp', () => {
    expect(toLiteRounded(prf(0.8333333, 1, 0.909090909))).toEqual({
      precision: 0.8333,
      recall: 1,
      f1: 0.9091,
    });
  });
});

describe('baselineEntry', () => {
  it('is the rounded { connections, externalSystems } block', () => {
    expect(baselineEntry(report('x', prf(0.5, 0.25, 1 / 3), prf(1, 2 / 3, 0.8)))).toEqual({
      connections: { precision: 0.5, recall: 0.25, f1: 0.3333 },
      externalSystems: { precision: 1, recall: 0.6667, f1: 0.8 },
    });
  });
});

describe('diffBaseline', () => {
  it('unchanged run → ok, no movements', () => {
    const d = diffBaseline([report('s', prf(0.875, 1, 0.933))], baseline('s', [0.875, 1, 0.933]));
    expect(d.ok).toBe(true);
    expect(d.movements).toEqual([]);
    expect(d.missing).toEqual([]);
  });

  it('a drop exactly at the tolerance is allowed', () => {
    const d = diffBaseline([report('s', prf(1 - TOLERANCE, 1, 1))], baseline('s', [1, 1, 1]));
    expect(d.ok).toBe(true);
    expect(d.movements.some((m) => m.regressed)).toBe(false);
    // still surfaced as a (non-regression) movement
    expect(d.movements.find((m) => m.metric === 'precision')?.delta).toBeCloseTo(-TOLERANCE, 10);
  });

  it('a drop just past the tolerance is a regression', () => {
    const d = diffBaseline(
      [report('s', prf(1 - TOLERANCE - 1e-3, 1, 1))],
      baseline('s', [1, 1, 1])
    );
    expect(d.ok).toBe(false);
    const m = d.movements.find((x) => x.metric === 'precision');
    expect(m?.regressed).toBe(true);
    expect(m?.group).toBe('connections');
  });

  it('an improvement is a movement but never a regression', () => {
    const d = diffBaseline([report('s', prf(1, 1, 1))], baseline('s', [0.8, 1, 1]));
    expect(d.ok).toBe(true);
    const m = d.movements.find((x) => x.metric === 'precision');
    expect(m?.regressed).toBe(false);
    expect(m?.delta).toBeCloseTo(0.2, 10);
  });

  it('sub-noise-floor wobble is not reported', () => {
    const d = diffBaseline([report('s', prf(1 - NOISE_FLOOR / 2, 1, 1))], baseline('s', [1, 1, 1]));
    expect(d.ok).toBe(true);
    expect(d.movements).toEqual([]);
  });

  it('a set with no baseline entry fails the gate', () => {
    const d = diffBaseline([report('newset', prf(1, 1, 1))], baseline('other', [1, 1, 1]));
    expect(d.ok).toBe(false);
    expect(d.missing).toEqual(['newset']);
    expect(d.movements).toEqual([]);
  });

  it('regression in externalSystems recall is caught and labelled', () => {
    const d = diffBaseline(
      [report('s', prf(0.875, 1, 0.933), prf(1, 0, 0))],
      baseline('s', [0.875, 1, 0.933], [1, 1, 1])
    );
    expect(d.ok).toBe(false);
    const m = d.movements.find((x) => x.group === 'externalSystems' && x.metric === 'recall');
    expect(m?.regressed).toBe(true);
    expect(m?.was).toBe(1);
    expect(m?.now).toBe(0);
  });

  it('scores several sets independently', () => {
    const d = diffBaseline([report('a', prf(1, 1, 1)), report('b', prf(0.5, 1, 0.667))], {
      ...baseline('a', [1, 1, 1]),
      ...baseline('b', [1, 1, 1]),
    });
    expect(d.ok).toBe(false);
    expect(d.movements.filter((m) => m.regressed).map((m) => m.set)).toEqual(['b', 'b']);
  });
});
