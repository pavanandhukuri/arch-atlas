import { statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImportConfig } from '../config/config.schema.js';
import { ensureOutputDir, tryReadAnalysis, tryReadComponents } from './analysis-store.js';
import { toCorrelationGraph } from './to-correlation-graph.js';
import type { RepoAnalysis } from './repo-analysis.schema.js';
import type { ComponentAnalysis } from './component-analysis.schema.js';
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
 * 015-component-analysis-default: it also reads each repository's optional
 * `{repo}.components.json` (its internal-structure analysis) and folds it
 * directly onto that repo's `repos[]` entry in the review artifact — so the
 * one file this command writes is still the only file a human ever needs to
 * upload into Studio, container-and-component detail included.
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

/**
 * 008 US3 + 015-component-analysis-default: per-repo metadata carried onto
 * the review artifact's `repos[]` — description/technology (008), and now
 * also that repository's internal components/relationships, when a
 * `{repo}.components.json` was found alongside its `.analysis.json`. Folding
 * it in here (rather than a second artifact Studio has to separately ingest)
 * is what keeps `architecture.review.yaml` the one file a human ever uploads.
 */
function toRepoMeta(analysis: RepoAnalysis, components: ComponentAnalysis | undefined): RepoMeta {
  const tech = techLabel(analysis);
  return {
    name: analysis.repository.name,
    ...(analysis.description ? { description: analysis.description } : {}),
    ...(tech !== 'unknown' ? { technology: tech } : {}),
    ...(components && {
      components: components.components,
      componentRelationships: components.relationships,
    }),
  };
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Where the repo's source is read from for the source-level evidence passes.
 * The config says where the repo lives NOW; the path recorded inside an
 * analysis artifact is where it lived when the producer ran — a different
 * machine, a CI checkout, or a committed sample. Trusting the recorded path
 * alone made those silently lose every source-derived connection (the passes
 * fall back to intent-only matching when the path doesn't exist), so the
 * configured path wins whenever it exists. Resolved against the working
 * directory, like `gather-context` does.
 */
function sourceRoot(
  entry: ImportConfig['repositories'][number],
  analysis: RepoAnalysis
): { path: string; found: boolean } {
  const configured = resolve(entry.path);
  if (isDirectory(configured)) return { path: configured, found: true };
  const recorded = analysis.repository.path;
  return { path: recorded, found: isDirectory(recorded) };
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
  const componentsByName = new Map<string, ComponentAnalysis>();

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
    const root = sourceRoot(entry, result.analysis);
    result.analysis.repository.path = root.path;
    if (!root.found) {
      log(
        `[warn] ${name}: source not found at ${resolve(entry.path)} — ` +
          `source-level evidence skipped, only the analysis's own outbound intents are used`
      );
    }
    analysesByName.set(result.analysis.repository.name, result.analysis);
    graphs.push(toCorrelationGraph(result.analysis));
    log(`[load] ${name}: ${techLabel(result.analysis)}`);

    // 015-component-analysis-default: a {repo}.components.json is optional —
    // missing is the normal case for a repo analyzed before this feature, or
    // mid-import, and is not reported. Malformed is reported but never fails
    // the import; this repository's external-interface analysis above still
    // makes it into the review either way.
    const componentsResult = await tryReadComponents(outputDir, name);
    if (componentsResult.ok) {
      componentsByName.set(result.analysis.repository.name, componentsResult.components);
    } else if (componentsResult.reason === 'invalid') {
      log(
        `[warn] ${name}: invalid components artifact — ${componentsResult.detail ?? 'schema mismatch'}`
      );
    }
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
    [...analysesByName.values()].map((a) => [
      a.repository.name,
      toRepoMeta(a, componentsByName.get(a.repository.name)),
    ])
  );

  const systems = resolveSystems(config, new Set(analysesByName.keys()));
  const review = assembleReviewFile(graphs, [...connections, ...extra], repoMetaByName, systems);
  const reviewPath = join(outputDir, 'architecture.review.yaml');
  await writeFile(reviewPath, JSON.stringify(review, null, 2), 'utf8');
  log(`\n✓ Review artifact written to ${reviewPath}`);
  log(`  Upload it to Studio's import wizard to review candidates and build the diagram.`);
}
