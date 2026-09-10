/**
 * CORRELATION eval — `pnpm --filter @archatlas/llm-importer eval [-- <flags>]`.
 *
 * Deterministic, offline, no model: load a golden set's committed analyses, run
 * the real `toCorrelationGraph` → `correlateDeterministically` pipeline, and
 * score cross-repo connections and external-system recovery against
 * `ground-truth.json`.
 *
 *   (no flag)           print the per-set report                     exit 0
 *   --set <name>        restrict to one golden set
 *   --check             gate every metric against baseline.json      exit 0 | 1 | 2
 *   --update-baseline   rewrite baseline.json from this run          exit 0
 *
 * `--check`: exit 1 when a metric is more than TOLERANCE below baseline; exit 2
 * when baseline.json is missing/invalid or a ground-truth file is inconsistent.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toCorrelationGraph } from '../src/analysis/to-correlation-graph.js';
import {
  correlateDeterministically,
  type CrossRepositoryConnection,
} from '../src/correlate/deterministic-correlator.js';
import { GOLDEN_DIR, listGoldenSets, loadGoldenSet } from './load.js';
import { BaselineSchema } from './schema.js';
import { normalize, scoreConnections, scoreExternalSystems } from './score.js';
import type { Baseline, CorrelationReport, PRF, PrfLite } from './types.js';

const BASELINE_PATH = join(GOLDEN_DIR, '..', 'baseline.json');
/** Absolute slack a metric may fall below baseline before `--check` fails (research.md D5). */
const TOLERANCE = 0.02;
const METRICS = ['precision', 'recall', 'f1'] as const;

interface Args {
  set: string | null;
  check: boolean;
  updateBaseline: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { set: null, check: false, updateBaseline: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--' || v === undefined)
      continue; // package-manager arg separator
    else if (v === '--set') a.set = argv[++i] ?? null;
    else if (v === '--check') a.check = true;
    else if (v === '--update-baseline') a.updateBaseline = true;
    else throw new EvalSetupError(`unknown flag: ${v}`);
  }
  return a;
}

/** Thrown for a broken harness setup (missing/invalid baseline, bad ground truth) → exit 2. */
class EvalSetupError extends Error {}

function edgeLabel(from: string, to: string): string {
  return `${from} -> ${to}`;
}

function evalSet(name: string): CorrelationReport {
  const { config, groundTruth, analyses } = loadGoldenSet(name);
  const repoNames = config.repos.map((r) => r.name);
  const isRepo = (t: string): boolean => repoNames.some((r) => normalize(r) === normalize(t));

  const graphs = analyses.map(toCorrelationGraph);
  const { connections } = correlateDeterministically(graphs);

  // every directed edge scoreConnections sees (repo→repo AND repo→external)
  const allEdges = (cs: CrossRepositoryConnection[]): string[] =>
    [...new Set(cs.map((c) => edgeLabel(c.sourceRepo, c.targetRepo)))].sort();
  // the non-repo targets scoreExternalSystems sees
  const externals = (cs: CrossRepositoryConnection[]): string[] =>
    [...new Set(cs.filter((c) => !isRepo(c.targetRepo)).map((c) => c.targetRepo))].sort();

  return {
    set: name,
    generatedAt: new Date().toISOString(),
    connections: scoreConnections(connections, groundTruth),
    externalSystems: scoreExternalSystems(connections, groundTruth.externalSystems, repoNames),
    expected: {
      connections: groundTruth.connections.map((c) => edgeLabel(c.from, c.to)).sort(),
      externalSystems: [...groundTruth.externalSystems].sort(),
    },
    predicted: {
      connections: allEdges(connections),
      externalSystems: externals(connections),
    },
  };
}

const pct = (n: number): string => n.toFixed(3);
const lite = (p: PRF): PrfLite => ({ precision: p.precision, recall: p.recall, f1: p.f1 });
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function printReport(r: CorrelationReport): void {
  console.log(`\n=== ${r.set} ===`);
  console.log('  connections');
  console.log(
    `    expected  (${r.expected.connections.length}): ${r.expected.connections.join(', ') || '—'}`
  );
  console.log(
    `    predicted (${r.predicted.connections.length}): ${r.predicted.connections.join(', ') || '—'}`
  );
  console.log(
    `    precision ${pct(r.connections.precision)}  recall ${pct(r.connections.recall)}  f1 ${pct(r.connections.f1)}  (tp ${r.connections.tp} fp ${r.connections.fp} fn ${r.connections.fn})`
  );
  console.log('  externalSystems');
  console.log(
    `    expected  (${r.expected.externalSystems.length}): ${r.expected.externalSystems.join(', ') || '—'}`
  );
  console.log(
    `    predicted (${r.predicted.externalSystems.length}): ${r.predicted.externalSystems.join(', ') || '—'}`
  );
  console.log(
    `    precision ${pct(r.externalSystems.precision)}  recall ${pct(r.externalSystems.recall)}  f1 ${pct(r.externalSystems.f1)}  (tp ${r.externalSystems.tp} fp ${r.externalSystems.fp} fn ${r.externalSystems.fn})`
  );
}

function readBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) {
    throw new EvalSetupError(
      `no baseline at ${BASELINE_PATH} — run \`eval -- --update-baseline\` first`
    );
  }
  try {
    return BaselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
  } catch (err) {
    throw new EvalSetupError(
      `baseline.json is invalid: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** @returns true when every metric is within TOLERANCE of (or above) baseline. */
function checkAgainstBaseline(reports: CorrelationReport[], baseline: Baseline): boolean {
  let ok = true;
  for (const r of reports) {
    const base = baseline[r.set];
    if (!base) {
      console.error(
        `  ✗ ${r.set}: no baseline entry — run \`eval -- --update-baseline --set ${r.set}\``
      );
      ok = false;
      continue;
    }
    for (const group of ['connections', 'externalSystems'] as const) {
      for (const m of METRICS) {
        const now = r[group][m];
        const was = base[group][m];
        const delta = now - was;
        if (delta < -TOLERANCE) {
          ok = false;
          console.error(
            `  ✗ ${r.set}.${group}.${m}: baseline ${pct(was)} → current ${pct(now)} (Δ ${pct(delta)})`
          );
        } else if (Math.abs(delta) > 5e-4) {
          console.log(
            `  · ${r.set}.${group}.${m}: ${pct(was)} → ${pct(now)} (Δ ${delta >= 0 ? '+' : ''}${pct(delta)})`
          );
        }
      }
    }
  }
  return ok;
}

function writeBaseline(reports: CorrelationReport[]): void {
  const merged: Baseline = existsSync(BASELINE_PATH)
    ? BaselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')))
    : {};
  for (const r of reports) {
    merged[r.set] = {
      connections: mapLite(lite(r.connections)),
      externalSystems: mapLite(lite(r.externalSystems)),
    };
  }
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\nbaseline written to ${BASELINE_PATH}`);
}

const mapLite = (p: PrfLite): PrfLite => ({
  precision: round4(p.precision),
  recall: round4(p.recall),
  f1: round4(p.f1),
});

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const all = listGoldenSets();
  if (all.length === 0) throw new EvalSetupError(`no golden sets under ${GOLDEN_DIR}`);
  const sets = args.set ? [args.set] : all;
  if (args.set && !all.includes(args.set))
    throw new EvalSetupError(`no golden set "${args.set}" (have: ${all.join(', ')})`);

  let reports: CorrelationReport[];
  try {
    reports = sets.map(evalSet);
  } catch (err) {
    // a missing artifact, an inconsistent ground-truth file, a schema violation
    throw new EvalSetupError(err instanceof Error ? err.message : String(err));
  }
  reports.forEach(printReport);

  if (args.updateBaseline) {
    writeBaseline(reports);
    return;
  }
  if (args.check) {
    const ok = checkAgainstBaseline(reports, readBaseline());
    console.log(ok ? '\n✓ no regression beyond tolerance' : '\n✗ regression detected');
    process.exitCode = ok ? 0 : 1;
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
