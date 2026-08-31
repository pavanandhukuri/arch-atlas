/**
 * `pnpm eval [--set <name>] [--runs N] [--check] [--no-judge] [--agentic]`
 *
 * Runs `analyzeRepo` N times per repo in each golden set against a live local
 * model, scores against `ground-truth.json`, prints a report, and writes
 * `test/eval/baseline.json`. With `--check` it diffs the fresh run against the
 * committed baseline and exits non-zero on a regression beyond TOLERANCE.
 *
 * Model config from env (defaults target a local oMLX):
 *   EVAL_MODEL_ENDPOINT   http://127.0.0.1:8000/v1
 *   EVAL_MODEL_ID         Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
 *   EVAL_MODEL_PROVIDER   openai-compatible
 *   EVAL_MODEL_API_KEY    (unset)
 *   EVAL_TEMPERATURE      0.1
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import {
  toCorrelationGraph,
  correlateDeterministically,
  type RepoAnalysis,
  type CrossRepositoryConnection,
} from '@arch-atlas/llm-importer';
import {
  analyzeRepoLocal,
  resolveUnresolvedPairs,
  chatComplete,
  checkLocalModelReachable,
} from '@arch-atlas/analysis-runner-local';
import { ensureClonedWorkspace } from './clone-workspace.js';
import {
  analysisFields,
  averagePrf,
  groundTruthFields,
  mean,
  meanPairwiseJaccard,
  scoreConnections,
  scoreRepoRun,
  stddev,
} from './score.js';
import type {
  EvalConfig,
  EvalReport,
  PRF,
  RepoFieldScores,
  WorkspaceGroundTruth,
} from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, 'golden');
const BASELINE_PATH = join(HERE, 'baseline.json');
const TOLERANCE = 0.05;
const SERVED_CONSISTENCY_FIELDS = [
  'httpRoutes',
  'grpcServices',
  'topics',
  'datastores',
  'frameworks',
];

interface Args {
  set: string;
  runs: number;
  check: boolean;
  judge: boolean;
  agentic: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { set: 'all', runs: 3, check: false, judge: true, agentic: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--set') a.set = argv[++i] ?? 'all';
    else if (v === '--runs') a.runs = Math.max(1, parseInt(argv[++i] ?? '3', 10));
    else if (v === '--check') a.check = true;
    else if (v === '--no-judge') a.judge = false;
    else if (v === '--agentic') a.agentic = true;
  }
  return a;
}

interface EvalModelConfig {
  endpoint: string;
  modelId: string;
  apiKey?: string;
  temperature: number;
}

function modelConfigFromEnv(): EvalModelConfig {
  return {
    endpoint: process.env.EVAL_MODEL_ENDPOINT ?? 'http://127.0.0.1:8000/v1',
    modelId: process.env.EVAL_MODEL_ID ?? 'Qwen3-Coder-30B-A3B-Instruct-MLX-4bit',
    ...(process.env.EVAL_MODEL_API_KEY ? { apiKey: process.env.EVAL_MODEL_API_KEY } : {}),
    temperature: Number(process.env.EVAL_TEMPERATURE ?? '0.1'),
  };
}

function resolveWorkspaceBase(name: string, cfg: EvalConfig): string {
  const goldenDir = join(GOLDEN_DIR, name);
  if ('local' in cfg.workspace) return resolve(goldenDir, cfg.workspace.local);
  const root = ensureClonedWorkspace(goldenDir, cfg.workspace.clone);
  return cfg.workspace.clone.subdir ? join(root, cfg.workspace.clone.subdir) : root;
}

async function judgeDescription(
  model: EvalModelConfig,
  role: string,
  description: string
): Promise<number> {
  if (!description.trim()) return 1;
  const text = await chatComplete({
    endpoint: model.endpoint,
    modelId: model.modelId,
    ...(model.apiKey !== undefined ? { apiKey: model.apiKey } : {}),
    temperature: model.temperature,
    messages: [
      {
        role: 'user',
        content:
          `A repository's TRUE role:\n"${role}"\n\nA generated DESCRIPTION of it:\n"${description}"\n\n` +
          'Rate how accurately the description captures that role: 5 = accurate and specific, ' +
          '3 = vague but not wrong, 1 = wrong or hallucinated. Reply with ONLY the single digit.',
      },
    ],
  });
  const m = /[1-5]/.exec(text);
  return m ? Number(m[0]) : 3;
}

async function evalSet(name: string, args: Args, model: EvalModelConfig): Promise<EvalReport> {
  const goldenDir = join(GOLDEN_DIR, name);
  const cfg = parseYaml(readFileSync(join(goldenDir, 'eval.config.yaml'), 'utf8')) as EvalConfig;
  const gt = JSON.parse(
    readFileSync(join(goldenDir, 'ground-truth.json'), 'utf8')
  ) as WorkspaceGroundTruth;
  const base = resolveWorkspaceBase(name, cfg);

  // analyses[runIdx][repoName]
  const analyses: Array<Record<string, RepoAnalysis>> = [];
  const connScores: PRF[] = [];

  for (let run = 0; run < args.runs; run++) {
    process.stderr.write(`  [${name}] run ${run + 1}/${args.runs}\n`);
    const byRepo: Record<string, RepoAnalysis> = {};
    for (const repo of cfg.repos) {
      const res = await analyzeRepoLocal({
        repoName: repo.name,
        input: { repoPath: join(base, repo.path) },
        endpoint: model.endpoint,
        modelId: model.modelId,
        ...(model.apiKey !== undefined ? { apiKey: model.apiKey } : {}),
        temperature: model.temperature,
      });
      if (res.status !== 'failed') byRepo[repo.name] = res.analysis;
      else process.stderr.write(`    ! ${repo.name} failed: ${res.error}\n`);
    }
    analyses.push(byRepo);

    const graphs = Object.values(byRepo).map(toCorrelationGraph);
    const det = correlateDeterministically(graphs);
    let connections: CrossRepositoryConnection[] = det.connections;
    if (args.agentic && det.unresolvedPairs.length > 0) {
      const graphsByName = new Map(graphs.map((g) => [g.repository.name, g]));
      connections = [
        ...connections,
        ...(await resolveUnresolvedPairs({
          pairs: det.unresolvedPairs,
          graphsByName,
          endpoint: model.endpoint,
          modelId: model.modelId,
          ...(model.apiKey !== undefined ? { apiKey: model.apiKey } : {}),
          temperature: model.temperature,
        })),
      ];
    }
    connScores.push(scoreConnections(connections, gt));
  }

  const perRepo: Record<string, RepoFieldScores> = {};
  for (const [repoName, expected] of Object.entries(gt.repos)) {
    const runsForRepo = analyses.map((a) => a[repoName]).filter((x): x is RepoAnalysis => !!x);
    if (runsForRepo.length === 0) {
      process.stderr.write(`  [${name}] ${repoName}: no successful runs — scored 0\n`);
    }
    const fieldRuns = runsForRepo.map((a) => scoreRepoRun(a, expected));
    const fields = [
      'languages',
      'frameworks',
      'httpRoutes',
      'grpcServices',
      'topics',
      'datastores',
      'outbound',
    ] as const;
    const avg = Object.fromEntries(
      fields.map((f) => [f, averagePrf(fieldRuns.map((r) => r[f] ?? zeroPrf()))])
    ) as Record<(typeof fields)[number], PRF>;

    const consistency: Record<string, number> = {};
    for (const f of SERVED_CONSISTENCY_FIELDS) {
      consistency[f] = meanPairwiseJaccard(
        runsForRepo.map(
          (a) => (f === 'frameworks' ? analysisFields(a).frameworks : analysisFields(a)[f]) ?? []
        )
      );
    }
    void groundTruthFields; // (kept for symmetry / future per-field consistency-vs-gt)

    let descriptionScore: number | null = null;
    if (args.judge && runsForRepo.length > 0) {
      const scores: number[] = [];
      for (const a of runsForRepo) {
        scores.push(await judgeDescription(model, expected.role, a.description));
      }
      descriptionScore = mean(scores);
    }

    perRepo[repoName] = { ...avg, consistency, descriptionScore };
  }

  const aggregate = aggregateReport(perRepo, connScores);
  return {
    set: name,
    runs: args.runs,
    model: model.modelId,
    generatedAt: new Date().toISOString(),
    perRepo,
    aggregate,
  };
}

function zeroPrf(): PRF {
  return { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 };
}

function aggregateReport(
  perRepo: Record<string, RepoFieldScores>,
  connScores: PRF[]
): Record<string, number> {
  const repos = Object.values(perRepo);
  const meanF1 = (field: keyof RepoFieldScores): number =>
    mean(repos.map((r) => (r[field] as PRF).f1));
  const meanRecall = (field: keyof RepoFieldScores): number =>
    mean(repos.map((r) => (r[field] as PRF).recall));
  const consistency = mean(
    repos.flatMap((r) => SERVED_CONSISTENCY_FIELDS.map((f) => r.consistency[f] ?? 1))
  );
  const judged = repos.map((r) => r.descriptionScore).filter((x): x is number => x !== null);
  return {
    languagesF1: round(meanF1('languages')),
    frameworksF1: round(meanF1('frameworks')),
    httpRoutesF1: round(meanF1('httpRoutes')),
    grpcServicesF1: round(meanF1('grpcServices')),
    topicsF1: round(meanF1('topics')),
    datastoresF1: round(meanF1('datastores')),
    outboundRecall: round(meanRecall('outbound')),
    connectionsPrecision: round(mean(connScores.map((c) => c.precision))),
    connectionsRecall: round(mean(connScores.map((c) => c.recall))),
    connectionsRecallStddev: round(stddev(connScores.map((c) => c.recall))),
    meanConsistency: round(consistency),
    meanDescriptionScore: judged.length ? round(mean(judged)) : 0,
  };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

function printReport(r: EvalReport): void {
  console.log(`\n=== ${r.set} — ${r.runs} run(s), model ${r.model} ===`);
  const rows = Object.entries(r.perRepo).map(([repo, s]) => ({
    repo,
    langF1: s.languages.f1.toFixed(2),
    fwF1: s.frameworks.f1.toFixed(2),
    httpF1: s.httpRoutes.f1.toFixed(2),
    grpcF1: s.grpcServices.f1.toFixed(2),
    topicF1: s.topics.f1.toFixed(2),
    dsF1: s.datastores.f1.toFixed(2),
    outR: s.outbound.recall.toFixed(2),
    consist: mean(SERVED_CONSISTENCY_FIELDS.map((f) => s.consistency[f] ?? 1)).toFixed(2),
    desc: s.descriptionScore === null ? '-' : s.descriptionScore.toFixed(1),
  }));
  console.table(rows);
  console.log('aggregate:', r.aggregate);
}

function diffAgainstBaseline(fresh: Record<string, EvalReport>): boolean {
  if (!existsSync(BASELINE_PATH)) {
    console.error(`no baseline at ${BASELINE_PATH} — run without --check first`);
    return false;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<
    string,
    { aggregate: Record<string, number> }
  >;
  let ok = true;
  for (const [set, report] of Object.entries(fresh)) {
    const base = baseline[set]?.aggregate;
    if (!base) {
      console.error(`baseline has no entry for set "${set}"`);
      ok = false;
      continue;
    }
    for (const [metric, value] of Object.entries(report.aggregate)) {
      if (metric.endsWith('Stddev')) continue;
      // a fresh --no-judge run reports 0 here; don't compare it to a judged baseline
      if (metric === 'meanDescriptionScore' && value === 0) continue;
      const b = base[metric];
      if (typeof b !== 'number') continue;
      const drop = b - value;
      const flag = drop > TOLERANCE ? '  <-- REGRESSION' : '';
      if (flag) ok = false;
      if (Math.abs(drop) > 0.001) {
        console.log(
          `  ${set}.${metric}: ${b.toFixed(3)} -> ${value.toFixed(3)} (${drop > 0 ? '-' : '+'}${Math.abs(drop).toFixed(3)})${flag}`
        );
      }
    }
  }
  return ok;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const setNames = args.set === 'all' ? ['fixtures', 'online-boutique'] : [args.set];
  const modelConfig = modelConfigFromEnv();

  try {
    await checkLocalModelReachable(modelConfig, 3000);
  } catch {
    console.error(
      `\nSkipping eval — local model endpoint ${modelConfig.endpoint} is unreachable.\n` +
        `Set EVAL_MODEL_ENDPOINT / EVAL_MODEL_ID / EVAL_MODEL_API_KEY and retry.\n`
    );
    process.exitCode = 0;
    return;
  }

  const reports: Record<string, EvalReport> = {};
  for (const name of setNames) {
    const report = await evalSet(name, args, modelConfig);
    reports[name] = report;
    printReport(report);
  }

  if (args.check) {
    const ok = diffAgainstBaseline(reports);
    console.log(ok ? '\n✓ no regression beyond tolerance' : '\n✗ regression detected');
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // merge into (not overwrite) the baseline so `--set X` updates only X
  const merged: Record<string, EvalReport> = existsSync(BASELINE_PATH)
    ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, EvalReport>)
    : {};
  Object.assign(merged, reports);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`\nbaseline written to ${BASELINE_PATH}`);
}

void main();
