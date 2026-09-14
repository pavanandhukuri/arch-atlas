import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImportConfig } from '../config/config.schema.js';
import { ensureOutputDir, tryReadAnalysis } from './analysis-store.js';
import { toCorrelationGraph } from './to-correlation-graph.js';
import type { RepoAnalysis } from './repo-analysis.schema.js';
import type { RepoMeta, ReviewFile } from '../review/review-file.js';
import type { RepositoryKnowledgeGraph } from '../graph/schema.js';
import { correlateDeterministically } from '../correlate/deterministic-correlator.js';
import { readExtraConnections } from '../correlate/extra-connections.js';
import { assembleReviewFile } from '../review/assemble-review.js';

/**
 * 010-harness-neutral-importer: the `import` command is deterministic and
 * model-free. It reads one `{repo}.analysis.json` per configured repository
 * (produced by an external analysis producer), runs the unchanged cross-repo
 * correlation, merges the optional `architecture.extra-connections.json`, and
 * writes the review artifact. No model call, no network request.
 *
 * `import` writes ONLY `architecture.review.yaml` — every candidate `pending`,
 * for a human to review in Studio's import wizard. It does not also write a
 * `.arch.json`: Studio's wizard needs only the review artifact, and a diagram
 * built straight from unreviewed candidates would have zero relationships
 * (nothing is ever auto-accepted here) — a skeleton nobody asked for and
 * nobody used. Studio produces the real `.arch.json`, with relationships,
 * once a human has actually reviewed the candidates.
 */

export interface RunImportOptions {
  outputDirOverride?: string;
  repoNamesFilter?: string[];
  verbose: boolean;
}

function log(line: string): void {
  console.error(line);
}

/**
 * Frameworks the producer lists that aren't what you'd label a container with —
 * stdlib HTTP, transport/client libs, small utilities. Skipped when picking the
 * headline framework so `technology` reads "Go" or "Java / Spring Boot", not
 * "Go / net/http" or "Go / IBM/sarama". If every listed framework is noise, the
 * label falls back to just the language.
 */
const NOISE_FRAMEWORK =
  /^(net\/http|gorilla\/|golang\.org\/x\/|golang-jwt\/|lestrrat-go\/|IBM\/sarama|segmentio\/kafka-go|confluent|commander|dotenv|zod|js-yaml|lodash|axios|@types\/|kotlinx\.|firebase-)/i;

function techLabel(analysis: RepoAnalysis): string {
  const lang = analysis.languages[0];
  const framework = analysis.frameworks.find((f) => !NOISE_FRAMEWORK.test(f));
  if (lang && framework) return `${lang} / ${framework}`;
  return lang ?? framework ?? analysis.frameworks[0] ?? 'unknown';
}

/** 008 US3: per-repo metadata carried onto the review artifact's `repos[]`. */
function toRepoMeta(analysis: RepoAnalysis): RepoMeta {
  const tech = techLabel(analysis);
  return {
    name: analysis.repository.name,
    ...(analysis.description ? { description: analysis.description } : {}),
    ...(tech !== 'unknown' ? { technology: tech } : {}),
  };
}

function repoName(entry: ImportConfig['repositories'][number]): string {
  return entry.name ?? entry.path.split('/').filter(Boolean).pop() ?? entry.path;
}

/**
 * `import.yaml`'s `systems`, reconciled against the repos that actually
 * resolved this run — a typo'd or filtered-out repository is warned about and
 * dropped from that system rather than failing the whole import (same
 * tolerance as a missing/invalid analysis artifact).
 */
function resolveSystems(
  config: ImportConfig,
  resolvedNames: ReadonlySet<string>
): ReviewFile['systems'] {
  if (!config.systems) return [];
  const systems: ReviewFile['systems'] = [];
  for (const sys of config.systems) {
    const repositories = sys.repositories.filter((name) => {
      const known = resolvedNames.has(name);
      if (!known) {
        log(
          `[warn] system "${sys.name}": repository "${name}" not found among the imported repositories — skipped`
        );
      }
      return known;
    });
    if (repositories.length > 0) systems.push({ name: sys.name, repositories });
  }
  return systems;
}

export async function runImport(config: ImportConfig, options: RunImportOptions): Promise<void> {
  const outputDir = resolve(options.outputDirOverride ?? config.output.directory);
  await ensureOutputDir(outputDir);

  const selected = options.repoNamesFilter
    ? config.repositories.filter((r) => options.repoNamesFilter?.includes(r.name ?? r.path))
    : config.repositories;

  const graphs: RepositoryKnowledgeGraph[] = [];
  const analysesByName = new Map<string, RepoAnalysis>();

  for (const entry of selected) {
    const name = repoName(entry);
    const result = await tryReadAnalysis(outputDir, name);
    if (!result.ok) {
      const why =
        result.reason === 'missing'
          ? 'no analysis artifact'
          : `invalid analysis artifact — ${result.detail ?? 'schema mismatch'}`;
      log(`[skip] ${name}: ${why}`);
      continue;
    }
    analysesByName.set(result.analysis.repository.name, result.analysis);
    graphs.push(toCorrelationGraph(result.analysis));
    log(`[load] ${name}: ${techLabel(result.analysis)}`);
  }

  if (graphs.length === 0) {
    log(
      `\nNo valid analysis artifacts found in ${outputDir} — run a producer first ` +
        `(e.g. \`archatlas gather-context\` then the repo-analysis skill/plugin — ` +
        `see plugins/repo-analysis). Nothing exported.`
    );
    return;
  }

  log(`\nCorrelating across ${graphs.length} repositories...`);
  const { connections, unresolvedPairs, passSummaries } = correlateDeterministically(graphs);
  for (const summary of passSummaries) log(`    ${summary}`);
  log(
    `  Deterministic pass: ${connections.length} connection(s) found, ${unresolvedPairs.length} pair(s) unresolved`
  );

  const extra = readExtraConnections(outputDir);
  if (extra.length > 0) log(`  extra-connections: ${extra.length} loaded`);

  const repoMetaByName = new Map(
    [...analysesByName.values()].map((a) => [a.repository.name, toRepoMeta(a)])
  );

  const systems = resolveSystems(config, new Set(analysesByName.keys()));
  const review = assembleReviewFile(graphs, [...connections, ...extra], repoMetaByName, systems);
  const reviewPath = join(outputDir, 'architecture.review.yaml');
  await writeFile(reviewPath, JSON.stringify(review, null, 2), 'utf8');
  log(`\n✓ Review artifact written to ${reviewPath}`);
  log(`  Upload it to Studio's import wizard to review candidates and build the diagram.`);
}
