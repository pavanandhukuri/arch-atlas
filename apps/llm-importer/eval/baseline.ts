/**
 * `baseline.json` shaping + the regression-gate comparison. Pure, no I/O — unit
 * tested in `baseline.test.ts`; `run.ts` reads/writes the file and prints.
 */
import type { Baseline, CorrelationReport, PRF, PrfLite } from './types.js';

/** Absolute slack a metric may fall below baseline before `--check` fails (research.md D5). */
export const TOLERANCE = 0.02;
/** Smallest |delta| worth showing in the report (below this is rounding noise). */
export const NOISE_FLOOR = 5e-4;
/** Float-comparison slack so a drop of *exactly* TOLERANCE is not a regression. */
const EPSILON = 1e-9;

const GROUPS = ['connections', 'externalSystems'] as const;
const METRICS = ['precision', 'recall', 'f1'] as const;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The persisted P/R/F1 triple for one metric group, rounded so the diff is stable. */
export function toLiteRounded(p: PRF): PrfLite {
  return { precision: round4(p.precision), recall: round4(p.recall), f1: round4(p.f1) };
}

/** The `baseline.json` block for one report. */
export function baselineEntry(r: CorrelationReport): Baseline[string] {
  return {
    connections: toLiteRounded(r.connections),
    externalSystems: toLiteRounded(r.externalSystems),
  };
}

export interface MetricDelta {
  set: string;
  group: (typeof GROUPS)[number];
  metric: (typeof METRICS)[number];
  was: number;
  now: number;
  /** `now - was` — negative is a drop. */
  delta: number;
  /** `delta < -tolerance`. */
  regressed: boolean;
}

export interface BaselineDiff {
  /** No set is missing a baseline entry and no metric regressed. */
  ok: boolean;
  /** Sets in `reports` with no entry in the baseline. */
  missing: string[];
  /** Every metric that moved by more than `NOISE_FLOOR`, regressions included. */
  movements: MetricDelta[];
}

export function diffBaseline(
  reports: CorrelationReport[],
  baseline: Baseline,
  tolerance: number = TOLERANCE
): BaselineDiff {
  const missing: string[] = [];
  const movements: MetricDelta[] = [];
  let ok = true;

  for (const r of reports) {
    const base = baseline[r.set];
    if (!base) {
      missing.push(r.set);
      ok = false;
      continue;
    }
    for (const group of GROUPS) {
      for (const metric of METRICS) {
        const now = r[group][metric];
        const was = base[group][metric];
        const delta = now - was;
        const regressed = delta < -tolerance - EPSILON;
        if (regressed) ok = false;
        if (regressed || Math.abs(delta) > NOISE_FLOOR) {
          movements.push({ set: r.set, group, metric, was, now, delta, regressed });
        }
      }
    }
  }
  return { ok, missing, movements };
}
