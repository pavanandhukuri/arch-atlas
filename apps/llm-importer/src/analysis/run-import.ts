import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImportConfig } from '../config/config.schema.js';
import { buildLocalModelRuntime } from '../model-runtime/local-model-runtime.js';
import { SharedLimiter } from '../concurrency/shared-limiter.js';
import { analyzeRepo } from './analyze-repo.js';
import {
  ensureOutputDir,
  hasValidCachedAnalysis,
  listAllAnalyses,
  readAnalysis,
  writeAnalysis,
} from './analysis-store.js';
import { toCorrelationGraph } from './to-correlation-graph.js';
import type { RepoAnalysis } from './repo-analysis.schema.js';
import type { RepoMeta } from '../review/review-file.js';
import type { RepositoryKnowledgeGraph } from '../graph/schema.js';
import { correlateDeterministically } from '../correlate/deterministic-correlator.js';
import { correlateAgentically } from '../correlate/agentic-correlator.js';
import { assembleReviewFile } from '../review/assemble-review.js';
import { buildDiagram } from '../export/diagram-builder.js';

export interface RunImportOptions {
  outputDirOverride?: string;
  forceRefresh: boolean;
  repoNamesFilter?: string[];
  analyzeOnly: boolean;
  aggregateOnly: boolean;
  maxConcurrencyOverride?: number;
  verbose: boolean;
}

function log(line: string): void {
  console.error(line);
}

/** US2/FR-014: partial-failure summary — never silently drops a failed repo. */
function reportFailures(failures: Array<{ name: string; error: string }>): void {
  if (failures.length === 0) return;
  log(`\n⚠ ${failures.length} repositor${failures.length === 1 ? 'y' : 'ies'} failed after retry:`);
  for (const f of failures) log(`  - ${f.name}: ${f.error}`);
}

function techLabel(analysis: RepoAnalysis): string {
  return (
    analysis.frameworks[0] ??
    (analysis.languages.length > 0 ? analysis.languages.join('/') : 'unknown')
  );
}

function servedSummary(analysis: RepoAnalysis): string {
  const routes = analysis.served.httpRoutes.length + analysis.served.grpcServices.length;
  const topics = analysis.served.topics.length;
  const outbound = analysis.outbound.length;
  return `${routes} route(s), ${topics} topic(s), ${outbound} outbound intent(s)`;
}

/** 008 US3: per-repo metadata carried onto the review artifact + diagram. */
function toRepoMeta(analysis: RepoAnalysis): RepoMeta {
  const tech = techLabel(analysis);
  return {
    name: analysis.repository.name,
    ...(analysis.description ? { description: analysis.description } : {}),
    ...(tech !== 'unknown' ? { technology: tech } : {}),
  };
}

export async function runImport(config: ImportConfig, options: RunImportOptions): Promise<void> {
  const outputDir = resolve(options.outputDirOverride ?? config.output.directory);
  await ensureOutputDir(outputDir);

  const maxConcurrency = options.maxConcurrencyOverride ?? config.analysis.maxConcurrency;
  const limiter = new SharedLimiter(maxConcurrency);

  const { modelRuntime, model } = await buildLocalModelRuntime(
    config.localModel,
    outputDir,
    config.analysis.temperature
  );

  const selectedRepos = options.repoNamesFilter
    ? config.repositories.filter((r) => options.repoNamesFilter?.includes(r.name ?? r.path))
    : config.repositories;

  const graphs: RepositoryKnowledgeGraph[] = [];
  const analysesByName = new Map<string, RepoAnalysis>();
  const failures: Array<{ name: string; error: string }> = [];

  const register = (analysis: RepoAnalysis): void => {
    analysesByName.set(analysis.repository.name, analysis);
    graphs.push(toCorrelationGraph(analysis));
  };

  if (options.aggregateOnly) {
    // FR-012: skip analysis entirely, load every existing analysis artifact.
    for (const analysis of await listAllAnalyses(outputDir)) register(analysis);
  } else {
    await Promise.all(
      selectedRepos.map(async (repo) => {
        const name = repo.name ?? repo.path.split('/').filter(Boolean).pop() ?? repo.path;

        // US3/FR-012: skip repos with a valid existing artifact unless --force-refresh.
        const forceThisRun = options.forceRefresh || config.analysis.forceRefresh;
        if (!forceThisRun && (await hasValidCachedAnalysis(outputDir, name))) {
          log(`[skip] ${name}: valid cached analysis exists`);
          register(await readAnalysis(outputDir, name));
          return;
        }

        const result = await analyzeRepo({
          repoName: name,
          repoPath: resolve(repo.path),
          repoDescription: repo.description,
          model,
          modelRuntime,
          limiter,
          structuredOutput: config.analysis.structuredOutput,
          verifyGrounding: config.analysis.verifyGrounding,
          onProgress: (line) => {
            log(`[analyze] ${name}: ${line}`);
          },
        });

        if (result.status === 'failed') {
          log(`[failed] ${name}: ${result.error}`);
          failures.push({ name, error: result.error });
          return;
        }

        await writeAnalysis(outputDir, result.analysis);
        log(`[done] ${name}: ${techLabel(result.analysis)} · ${servedSummary(result.analysis)}`);
        register(result.analysis);
      })
    );
  }

  reportFailures(failures);

  if (options.analyzeOnly) {
    log(
      `\nAnalysis complete (--analyze-only): ${analysesByName.size} repositor${analysesByName.size === 1 ? 'y' : 'ies'} analyzed.`
    );
    return;
  }

  if (graphs.length === 0) {
    log('\nNo repositories were successfully analyzed — nothing to correlate or export.');
    return;
  }

  log(`\nCorrelating across ${graphs.length} repositories...`);
  const {
    connections: deterministicConnections,
    unresolvedPairs,
    passSummaries,
  } = correlateDeterministically(graphs);
  for (const summary of passSummaries) log(`    ${summary}`);
  log(
    `  Deterministic pass: ${deterministicConnections.length} connection(s) found, ${unresolvedPairs.length} pair(s) unresolved`
  );

  let agenticConnections: Awaited<ReturnType<typeof correlateAgentically>> = [];
  if (unresolvedPairs.length > 0) {
    log(`  Agentic fallback: analyzing ${unresolvedPairs.length} unresolved pair(s)...`);
    const graphsByName = new Map(graphs.map((g) => [g.repository.name, g]));
    agenticConnections = await correlateAgentically(
      unresolvedPairs,
      graphsByName,
      model,
      modelRuntime,
      limiter
    );
    log(`  Agentic pass: ${agenticConnections.length} connection(s) found`);
  }

  const repoMetaByName = new Map(
    [...analysesByName.values()].map((a) => [a.repository.name, toRepoMeta(a)])
  );

  const review = assembleReviewFile(
    graphs,
    [...deterministicConnections, ...agenticConnections],
    repoMetaByName
  );
  const reviewPath = join(outputDir, 'architecture.review.yaml');
  await writeFile(reviewPath, JSON.stringify(review, null, 2), 'utf8');
  log(`\n✓ Review artifact written to ${reviewPath}`);

  const diagramTitle =
    config.output.diagramFileName.replace(/\.arch\.json$/, '') || 'Imported Architecture';
  const diagram = buildDiagram(review, diagramTitle, repoMetaByName);
  const diagramPath = join(outputDir, config.output.diagramFileName);
  await writeFile(diagramPath, JSON.stringify(diagram, null, 2), 'utf8');
  log(`✓ Diagram written to ${diagramPath}`);
}
