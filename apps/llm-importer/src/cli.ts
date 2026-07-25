#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, ConfigValidationError } from './config/loader.js';
import {
  checkLocalModelReachable,
  LocalModelUnreachableError,
} from './model-runtime/local-model-runtime.js';
import { runImport } from './analysis/run-import.js';

export interface CliOptions {
  output?: string;
  forceRefresh?: boolean;
  repos?: string;
  analyzeOnly?: boolean;
  aggregateOnly?: boolean;
  maxConcurrency?: number;
  verbose?: boolean;
}

/**
 * Exit codes per contracts/cli-contract.md: 1 = config validation error,
 * 2 = local model endpoint unreachable (fails before any repository
 * analysis begins — US4 acceptance scenario 2), other uncaught errors also
 * exit 1.
 */
export async function runCli(configFile: string, options: CliOptions): Promise<number> {
  try {
    const config = await loadConfig(configFile);

    console.error(
      `Checking local model endpoint... ${config.localModel.endpoint} (${config.localModel.provider})`
    );
    await checkLocalModelReachable(config.localModel);
    console.error(`✓ Model "${config.localModel.modelId}" endpoint is reachable`);

    await runImport(config, {
      outputDirOverride: options.output,
      forceRefresh: Boolean(options.forceRefresh),
      repoNamesFilter: options.repos?.split(',').map((s) => s.trim()),
      analyzeOnly: Boolean(options.analyzeOnly),
      aggregateOnly: Boolean(options.aggregateOnly),
      maxConcurrencyOverride: options.maxConcurrency,
      verbose: Boolean(options.verbose),
    });
    return 0;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      return 1;
    }
    if (error instanceof LocalModelUnreachableError) {
      console.error(error.message);
      return 2;
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return 1;
  }
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('arch-atlas-import')
    .description('Agentic, local-model-driven repository architecture importer')
    .argument('<config-file>', 'Path to import config (.json or .yaml/.yml)')
    .option('--output <dir>', 'Override output directory from config')
    .option(
      '--force-refresh',
      'Re-analyze all repos even if a knowledge-graph artifact exists',
      false
    )
    .option('--repos <names>', 'Comma-separated repo names to analyze (subset of config)')
    .option(
      '--analyze-only',
      'Run per-repo agent analysis but skip correlation/review-assembly',
      false
    )
    .option(
      '--aggregate-only',
      'Skip analysis, run correlation + review-assembly from existing artifacts',
      false
    )
    .option('--max-concurrency <n>', 'Override analysis.maxConcurrency', (v) => parseInt(v, 10))
    .option('--verbose', 'Print detailed progress', false)
    .action(async (configFile: string, options: CliOptions) => {
      const exitCode = await runCli(configFile, options);
      if (exitCode !== 0) process.exitCode = exitCode;
    });
  return program;
}

// Only parse real argv when this file is the actual process entrypoint —
// not on every import, which is what made this file untestable before
// (module-load-time `program.parseAsync(process.argv)` as a side effect).
const isEntryPoint = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    });
}
