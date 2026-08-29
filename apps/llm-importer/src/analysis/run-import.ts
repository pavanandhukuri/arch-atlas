import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ImportConfig } from '../config/config.schema.js';
import { buildLocalModelRuntime } from '../model-runtime/local-model-runtime.js';
import { SharedLimiter } from '../concurrency/shared-limiter.js';
import { runUnderstand, ensureOutputDir } from './run-understand.js';
import {
  hasValidCachedArtifact,
  readKnowledgeGraph,
  writeKnowledgeGraph,
  listAllKnowledgeGraphs,
} from '../graph/knowledge-graph-store.js';
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

/** US2/FR-010: partial-failure summary — never silently drops a failed repo. */
function reportFailures(failures: Array<{ name: string; error: string }>): void {
  if (failures.length === 0) return;
  log(`\n⚠ ${failures.length} repositor${failures.length === 1 ? 'y' : 'ies'} failed after retry:`);
  for (const f of failures) log(`  - ${f.name}: ${f.error}`);
}

export async function runImport(config: ImportConfig, options: RunImportOptions): Promise<void> {
  const outputDir = resolve(options.outputDirOverride ?? config.output.directory);
  await ensureOutputDir(outputDir);

  const maxConcurrency = options.maxConcurrencyOverride ?? config.analysis.maxConcurrency;
  const limiter = new SharedLimiter(maxConcurrency);
  // research.md D8/FR-016: the vendored subagent extension (vendor/pi-subagent)
  // reads this env var for its own internal batch-fan-out limit, so it shares
  // the same bound as our repo-level SharedLimiter above rather than
  // multiplying two independently-scaling concurrency layers.
  process.env.ARCH_ATLAS_MAX_CONCURRENCY = String(maxConcurrency);

  const { modelRuntime, model } = await buildLocalModelRuntime(config.localModel, outputDir);

  const selectedRepos = options.repoNamesFilter
    ? config.repositories.filter((r) => options.repoNamesFilter?.includes(r.name ?? r.path))
    : config.repositories;

  const graphs: RepositoryKnowledgeGraph[] = [];
  const failures: Array<{ name: string; error: string }> = [];

  if (options.aggregateOnly) {
    // FR-012: skip analysis entirely, load every existing artifact in the output dir.
    graphs.push(...(await listAllKnowledgeGraphs(outputDir)));
  } else {
    await Promise.all(
      selectedRepos.map(async (repo) => {
        const name = repo.name ?? repo.path.split('/').filter(Boolean).pop() ?? repo.path;

        // US3/FR-011: skip repos with a valid existing artifact unless --force-refresh.
        const forceThisRun = options.forceRefresh || config.analysis.forceRefresh;
        if (!forceThisRun && (await hasValidCachedArtifact(outputDir, name))) {
          log(`[skip] ${name}: valid cached knowledge graph exists`);
          graphs.push(await readKnowledgeGraph(outputDir, name));
          return;
        }

        log(`[analyze] ${name}: starting...`);
        const result = await runUnderstand({
          repoName: name,
          repoPath: resolve(repo.path),
          repoDescription: repo.description,
          model,
          modelRuntime,
          limiter,
          verbose: options.verbose,
          onProgress: (line) => {
            if (options.verbose) log(`  [${name}] ${line}`);
          },
        });

        if (result.status === 'failed') {
          log(`[failed] ${name}: ${result.error}`);
          failures.push({ name, error: result.error });
          return;
        }

        await writeKnowledgeGraph(outputDir, result.graph);
        log(
          `[done] ${name}: ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges`
        );
        graphs.push(result.graph);
      })
    );
  }

  reportFailures(failures);

  if (options.analyzeOnly) {
    log(
      `\nAnalysis complete (--analyze-only): ${graphs.length} repositor${graphs.length === 1 ? 'y' : 'ies'} analyzed.`
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

  const review = assembleReviewFile(graphs, [...deterministicConnections, ...agenticConnections]);
  const reviewPath = join(outputDir, 'architecture.review.yaml');
  // Written as JSON (a valid YAML subset) — no yaml-serialization dependency
  // needed beyond what loadConfig already pulls in for reading, and Studio's
  // wizard parses this file with the same YAML/JSON-tolerant loader it
  // already uses for config.
  await writeFile(reviewPath, JSON.stringify(review, null, 2), 'utf8');
  log(`\n✓ Review artifact written to ${reviewPath}`);

  // For repos with candidates still pending human review, the final diagram
  // only reflects accepted candidates (buildDiagram filters on status
  // 'accepted') — on a fresh run that's typically empty, which is correct:
  // Studio's import wizard is where a human accepts/rejects before a
  // meaningful diagram exists. We still write whatever's accepted so far
  // (e.g. on a re-run after partial review) rather than skip export.
  const diagramTitle =
    config.output.diagramFileName.replace(/\.arch\.json$/, '') || 'Imported Architecture';
  const diagram = buildDiagram(review, diagramTitle);
  const diagramPath = join(outputDir, config.output.diagramFileName);
  await writeFile(diagramPath, JSON.stringify(diagram, null, 2), 'utf8');
  log(`✓ Diagram written to ${diagramPath}`);
}
