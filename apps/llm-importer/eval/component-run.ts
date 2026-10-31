/**
 * COMPONENT eval — `pnpm --filter @archatlas/llm-importer run eval:components [-- <flags>]`.
 *
 * Deterministic, offline, no model: load a golden-components set's committed
 * `{repo}.components.json` artifact, score its components and internal
 * relationships against `ground-truth.json`. Mirrors `run.ts`'s structure and
 * exit-code contract exactly, with its own golden-set directory and baseline
 * file — independent of the correlation eval.
 *
 *   (no flag)           print the per-set report                     exit 0
 *   --set <name>        restrict to one golden-components set
 *   --check             gate every metric against component-baseline.json  exit 0 | 1 | 2
 *   --update-baseline   rewrite component-baseline.json from this run      exit 0
 *
 * `--check`: exit 1 when a metric is more than TOLERANCE below baseline; exit 2
 * when component-baseline.json is missing/invalid or a ground-truth file is
 * inconsistent.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPONENT_GOLDEN_DIR,
  listComponentGoldenSets,
  loadComponentGoldenSet,
} from './component-load.js';
import { ComponentBaselineSchema } from './component-schema.js';
import type { ComponentBaseline, ComponentPrfLite, ComponentReport } from './component-types.js';
import { scoreComponents, scoreRelationships } from './score.js';

const BASELINE_PATH = join(COMPONENT_GOLDEN_DIR, '..', 'component-baseline.json');
/** Absolute slack a metric may fall below baseline before `--check` fails — same as the correlation eval. */
const TOLERANCE = 0.02;
const EPSILON = 1e-9;
const NOISE_FLOOR = 5e-4;

interface Args {
  set: string | null;
  check: boolean;
  updateBaseline: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { set: null, check: false, updateBaseline: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--' || v === undefined) continue;
    else if (v === '--set') a.set = argv[++i] ?? null;
    else if (v === '--check') a.check = true;
    else if (v === '--update-baseline') a.updateBaseline = true;
    else throw new EvalSetupError(`unknown flag: ${v}`);
  }
  return a;
}

class EvalSetupError extends Error {}

function evalSet(name: string): ComponentReport {
  const { groundTruth, artifact } = loadComponentGoldenSet(name);
  return {
    set: name,
    generatedAt: new Date().toISOString(),
    components: scoreComponents(artifact.components, groundTruth.components),
    relationships: scoreRelationships(artifact.relationships, groundTruth.relationships),
    expected: {
      components: groundTruth.components.map((c) => c.name).sort(),
      relationships: groundTruth.relationships.map((r) => `${r.from} -> ${r.to}`).sort(),
    },
    predicted: {
      components: artifact.components.map((c) => c.name).sort(),
      relationships: artifact.relationships.map((r) => `${r.source} -> ${r.target}`).sort(),
    },
  };
}

const pct = (n: number): string => n.toFixed(3);

function printReport(r: ComponentReport): void {
  console.log(`\n=== ${r.set} ===`);
  console.log('  components');
  console.log(
    `    expected  (${r.expected.components.length}): ${r.expected.components.join(', ') || '—'}`
  );
  console.log(
    `    predicted (${r.predicted.components.length}): ${r.predicted.components.join(', ') || '—'}`
  );
  console.log(
    `    precision ${pct(r.components.precision)}  recall ${pct(r.components.recall)}  f1 ${pct(r.components.f1)}  (tp ${r.components.tp} fp ${r.components.fp} fn ${r.components.fn})`
  );
  console.log('  relationships');
  console.log(
    `    expected  (${r.expected.relationships.length}): ${r.expected.relationships.join(', ') || '—'}`
  );
  console.log(
    `    predicted (${r.predicted.relationships.length}): ${r.predicted.relationships.join(', ') || '—'}`
  );
  console.log(
    `    precision ${pct(r.relationships.precision)}  recall ${pct(r.relationships.recall)}  f1 ${pct(r.relationships.f1)}  (tp ${r.relationships.tp} fp ${r.relationships.fp} fn ${r.relationships.fn})`
  );
}

function readBaseline(): ComponentBaseline {
  if (!existsSync(BASELINE_PATH)) {
    throw new EvalSetupError(
      `no baseline at ${BASELINE_PATH} — run \`eval:components -- --update-baseline\` first`
    );
  }
  try {
    return ComponentBaselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
  } catch (err) {
    throw new EvalSetupError(
      `component-baseline.json is invalid: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

interface MetricDelta {
  set: string;
  group: 'components' | 'relationships';
  metric: keyof ComponentPrfLite;
  was: number;
  now: number;
  delta: number;
  regressed: boolean;
}

function diffBaseline(
  reports: ComponentReport[],
  baseline: ComponentBaseline
): { ok: boolean; missing: string[]; movements: MetricDelta[] } {
  const missing: string[] = [];
  const movements: MetricDelta[] = [];
  let ok = true;
  const groups = ['components', 'relationships'] as const;
  const metrics = ['precision', 'recall', 'f1'] as const;

  for (const r of reports) {
    const base = baseline[r.set];
    if (!base) {
      missing.push(r.set);
      ok = false;
      continue;
    }
    for (const group of groups) {
      for (const metric of metrics) {
        const now = r[group][metric];
        const was = base[group][metric];
        const delta = now - was;
        const regressed = delta < -TOLERANCE - EPSILON;
        if (regressed) ok = false;
        if (regressed || Math.abs(delta) > NOISE_FLOOR) {
          movements.push({ set: r.set, group, metric, was, now, delta, regressed });
        }
      }
    }
  }
  return { ok, missing, movements };
}

function reportDiff(diff: { missing: string[]; movements: MetricDelta[] }): void {
  for (const set of diff.missing) {
    console.error(
      `  ✗ ${set}: no baseline entry — run \`eval:components -- --update-baseline --set ${set}\``
    );
  }
  for (const m of diff.movements) {
    const line = `${m.set}.${m.group}.${m.metric}: baseline ${pct(m.was)} → current ${pct(m.now)} (Δ ${m.delta >= 0 ? '+' : ''}${pct(m.delta)})`;
    if (m.regressed) console.error(`  ✗ ${line}`);
    else console.log(`  · ${line}`);
  }
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function writeBaseline(reports: ComponentReport[]): void {
  let merged: ComponentBaseline = {};
  if (existsSync(BASELINE_PATH)) {
    try {
      merged = ComponentBaselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
    } catch {
      console.error(`  (existing component-baseline.json was unreadable — rewriting from scratch)`);
    }
  }
  for (const r of reports) {
    merged[r.set] = {
      components: {
        precision: round4(r.components.precision),
        recall: round4(r.components.recall),
        f1: round4(r.components.f1),
      },
      relationships: {
        precision: round4(r.relationships.precision),
        recall: round4(r.relationships.recall),
        f1: round4(r.relationships.f1),
      },
    };
  }
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\nbaseline written to ${BASELINE_PATH}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const all = listComponentGoldenSets();
  if (all.length === 0)
    throw new EvalSetupError(`no golden-components sets under ${COMPONENT_GOLDEN_DIR}`);
  const sets = args.set ? [args.set] : all;
  if (args.set && !all.includes(args.set))
    throw new EvalSetupError(`no golden-components set "${args.set}" (have: ${all.join(', ')})`);

  let reports: ComponentReport[];
  try {
    reports = sets.map(evalSet);
  } catch (err) {
    throw new EvalSetupError(err instanceof Error ? err.message : String(err));
  }
  reports.forEach(printReport);

  if (args.updateBaseline) {
    writeBaseline(reports);
    return;
  }
  if (args.check) {
    const diff = diffBaseline(reports, readBaseline());
    reportDiff(diff);
    console.log(diff.ok ? '\n✓ no regression beyond tolerance' : '\n✗ regression detected');
    process.exitCode = diff.ok ? 0 : 1;
  }
}

try {
  main();
} catch (err) {
  if (err instanceof EvalSetupError) {
    console.error(`\n${err.message}`);
    process.exitCode = 2;
  } else {
    throw err;
  }
}
