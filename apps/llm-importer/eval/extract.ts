/**
 * EXTRACTION eval — `pnpm --filter @archatlas/llm-importer eval:extract [-- <flags>]`.
 *
 * Scores a set of `{repo}.analysis.json` artifacts (produced by whatever agent /
 * model per `plugins/repo-analysis/AGENTS.md`) against a golden set's per-repo
 * ground truth: precision / recall / F1 for languages, frameworks, served
 * interfaces and outbound targets.
 *
 *   --set <name>   golden set to score against            (default: first set)
 *   --out <dir>    dir of produced analyses to score      (default: the set's committed analyses)
 *
 * ALWAYS exits 0 — it is a report, it depends on a model, it NEVER runs in CI.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RepoAnalysisSchema, type RepoAnalysis } from '../src/analysis/repo-analysis.schema.js';
import { listGoldenSets, loadGoldenSet } from './load.js';
import { averagePrf, EXTRACTION_FIELDS, scoreRepoRun } from './score.js';
import type { ExtractionReport, PRF } from './types.js';

interface Args {
  set: string | null;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { set: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--' || v === undefined)
      continue; // package-manager arg separator
    else if (v === '--set') a.set = argv[++i] ?? null;
    else if (v === '--out') a.out = argv[++i] ?? null;
    else console.error(`ignoring unknown flag: ${v}`);
  }
  return a;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const all = listGoldenSets();
  if (all.length === 0) {
    console.error('no golden sets — nothing to score');
    return;
  }
  const [firstSet] = all;
  const setName = args.set ?? firstSet;
  if (setName === undefined || !all.includes(setName)) {
    console.error(`no golden set "${setName ?? ''}" (have: ${all.join(', ')})`);
    return;
  }

  const { groundTruth, analyses: committed } = loadGoldenSet(setName);

  /** Produced analysis for a repo: from `--out` if given, else the committed one. */
  const analysisFor = (repoName: string): RepoAnalysis | null => {
    if (args.out) {
      const file = join(args.out, `${repoName}.analysis.json`);
      if (!existsSync(file)) return null;
      return RepoAnalysisSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    }
    return committed.find((a) => a.repository.name === repoName) ?? null;
  };

  const perRepo: ExtractionReport['perRepo'] = {};
  for (const [repoName, repoGt] of Object.entries(groundTruth.repos)) {
    const analysis = analysisFor(repoName);
    if (!analysis) {
      console.error(
        `  [skip] ${repoName}: no analysis artifact${args.out ? ` in ${args.out}` : ''}`
      );
      continue;
    }
    perRepo[repoName] = scoreRepoRun(analysis, repoGt);
  }

  const aggregate: Record<string, PRF> = {};
  for (const field of EXTRACTION_FIELDS) {
    aggregate[field] = averagePrf(
      Object.values(perRepo)
        .map((r) => r[field])
        .filter((p): p is PRF => p !== undefined)
    );
  }

  printReport({ set: setName, perRepo, aggregate });
}

function printReport(r: ExtractionReport): void {
  console.log(`\n=== extraction: ${r.set} ===`);
  for (const [repo, fields] of Object.entries(r.perRepo)) {
    console.log(`\n  ${repo}`);
    for (const field of EXTRACTION_FIELDS) {
      const p = fields[field];
      if (!p) continue;
      console.log(
        `    ${field.padEnd(14)} P ${p.precision.toFixed(2)}  R ${p.recall.toFixed(2)}  F1 ${p.f1.toFixed(2)}  (tp ${p.tp} fp ${p.fp} fn ${p.fn})`
      );
    }
  }
  console.log('\n  aggregate (mean over repos)');
  for (const field of EXTRACTION_FIELDS) {
    const p = r.aggregate[field];
    if (!p) continue;
    console.log(
      `    ${field.padEnd(14)} P ${p.precision.toFixed(2)}  R ${p.recall.toFixed(2)}  F1 ${p.f1.toFixed(2)}`
    );
  }
  console.log('\n(extraction eval is advisory — exit 0 regardless)');
}

main();
