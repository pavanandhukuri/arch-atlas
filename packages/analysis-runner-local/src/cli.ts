#!/usr/bin/env node
import { rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  correlateDeterministically,
  ensureOutputDir,
  EXTRA_CONNECTIONS_FILE,
  EXTRA_CONNECTIONS_VERSION,
  hasValidCachedAnalysis,
  listAllAnalyses,
  readContextBundle,
  toCorrelationGraph,
  type RepositoryKnowledgeGraph,
} from '@arch-atlas/llm-importer';
import { analyzeRepoLocal } from './analyze-repo.js';
import { resolveUnresolvedPairs } from './agentic-fallback.js';
import { checkLocalModelReachable, LocalModelUnreachableError } from './reachability.js';
import { loadRunnerConfig, RunnerConfigError } from './config.js';

/**
 * `analysis-runner-local` — produce `{repo}.analysis.json` from a local model,
 * and (optionally) `architecture.extra-connections.json`.
 *
 * Exit codes: 0 success (incl. per-repo skips), 1 config error, 2 endpoint unreachable.
 */

function repoName(entry: { name?: string; path: string }): string {
  return entry.name ?? entry.path.split('/').filter(Boolean).pop() ?? entry.path;
}

function reposFilter(csv: string | undefined): Set<string> | undefined {
  return csv ? new Set(csv.split(',').map((s) => s.trim())) : undefined;
}

/** Write JSON atomically: temp file in the same dir, then rename. */
async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, path);
}

interface AnalyzeOptions {
  out?: string;
  repos?: string;
  forceRefresh?: boolean;
  fromBundles?: string;
}

export async function runAnalyze(configFile: string, options: AnalyzeOptions): Promise<number> {
  let config;
  try {
    config = await loadRunnerConfig(configFile);
  } catch (error) {
    if (error instanceof RunnerConfigError || error instanceof Error) console.error(error.message);
    return 1;
  }

  const outDir = resolve(options.out ?? config.output.directory);
  await ensureOutputDir(outDir);

  try {
    await checkLocalModelReachable(config.localModel);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const filter = reposFilter(options.repos);
  const selected = config.repositories.filter((r) => !filter || filter.has(repoName(r)));
  const force = options.forceRefresh ?? config.analysis.forceRefresh;

  let failures = 0;
  for (const entry of selected) {
    const name = repoName(entry);
    if (!force && (await hasValidCachedAnalysis(outDir, name))) {
      console.error(`[skip] ${name}: valid cached analysis exists`);
      continue;
    }

    const input = options.fromBundles
      ? { bundle: readContextBundle(join(resolve(options.fromBundles), `${name}.context.json`)) }
      : { repoPath: resolve(entry.path), descriptionHint: entry.description };

    const result = await analyzeRepoLocal({
      repoName: name,
      ...(entry.description !== undefined ? { repoDescription: entry.description } : {}),
      input,
      endpoint: config.localModel.endpoint,
      modelId: config.localModel.modelId,
      ...(config.localModel.apiKey !== undefined ? { apiKey: config.localModel.apiKey } : {}),
      temperature: config.analysis.temperature,
      structuredOutput: config.analysis.structuredOutput,
      verifyGrounding: config.analysis.verifyGrounding,
      onProgress: (line) => {
        console.error(`[analyze] ${name}: ${line}`);
      },
    });

    if (result.status === 'failed') {
      console.error(`[failed] ${name}: ${result.error}`);
      failures++;
      continue;
    }
    await writeAtomic(
      join(outDir, `${name}.analysis.json`),
      JSON.stringify(result.analysis, null, 2)
    );
    console.error(`[done] ${name}: ${result.status}`);
  }

  if (failures > 0)
    console.error(`\n⚠ ${failures} repositor${failures === 1 ? 'y' : 'ies'} failed`);
  return 0;
}

export async function runResolvePairs(
  configFile: string,
  options: { out?: string }
): Promise<number> {
  let config;
  try {
    config = await loadRunnerConfig(configFile);
  } catch (error) {
    if (error instanceof Error) console.error(error.message);
    return 1;
  }
  const outDir = resolve(options.out ?? config.output.directory);
  try {
    await checkLocalModelReachable(config.localModel);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const analyses = await listAllAnalyses(outDir);
  if (analyses.length < 2) {
    console.error('resolve-pairs: need at least 2 analysis artifacts — nothing to do');
    return 0;
  }
  const graphs: RepositoryKnowledgeGraph[] = analyses.map(toCorrelationGraph);
  const { unresolvedPairs } = correlateDeterministically(graphs);
  if (unresolvedPairs.length === 0) {
    console.error('resolve-pairs: no unresolved pairs');
    return 0;
  }
  console.error(`resolve-pairs: ${unresolvedPairs.length} unresolved pair(s)`);
  const connections = await resolveUnresolvedPairs({
    pairs: unresolvedPairs,
    graphsByName: new Map(graphs.map((g) => [g.repository.name, g])),
    endpoint: config.localModel.endpoint,
    modelId: config.localModel.modelId,
    ...(config.localModel.apiKey !== undefined ? { apiKey: config.localModel.apiKey } : {}),
    temperature: config.analysis.temperature,
  });
  if (connections.length === 0) {
    console.error('resolve-pairs: no connections found — writing nothing');
    return 0;
  }
  await writeAtomic(
    join(outDir, EXTRA_CONNECTIONS_FILE),
    JSON.stringify(
      {
        schemaVersion: EXTRA_CONNECTIONS_VERSION,
        generatedAt: new Date().toISOString(),
        connections,
      },
      null,
      2
    )
  );
  console.error(
    `resolve-pairs: wrote ${connections.length} connection(s) → ${EXTRA_CONNECTIONS_FILE}`
  );
  return 0;
}

export function buildProgram(): Command {
  const program = new Command();
  program.name('analysis-runner-local').description('Local-model producer of {repo}.analysis.json');

  program
    .command('analyze')
    .argument('<config-file>')
    .option('--out <dir>')
    .option('--repos <names>')
    .option('--force-refresh', 'Re-analyze even if a valid cached artifact exists', false)
    .option('--from-bundles <dir>', 'Read {repo}.context.json instead of walking the repo')
    .action(async (configFile: string, options: AnalyzeOptions) => {
      const code = await runAnalyze(configFile, options);
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('resolve-pairs')
    .argument('<config-file>')
    .option('--out <dir>')
    .action(async (configFile: string, options: { out?: string }) => {
      const code = await runResolvePairs(configFile, options);
      if (code !== 0) process.exitCode = code;
    });

  return program;
}

const isEntryPoint = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    });
}

// re-export so callers don't need a second import path
export { LocalModelUnreachableError };
