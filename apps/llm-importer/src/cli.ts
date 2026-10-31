#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import type { ArchitectureModel } from '@archatlas/core-model';
import { loadConfig, ConfigValidationError } from './config/loader.js';
import { runImport } from './analysis/run-import.js';
import { ensureOutputDir } from './analysis/analysis-store.js';
import { gatherContext } from './analysis/gather-context.js';
import { serializeContextBundle } from './analysis/context-bundle.js';
import { ComponentAnalysisSchema } from './analysis/component-analysis.schema.js';
import { attachComponentsToModel } from './arch/attach-components.js';
import {
  agentMenu,
  applyPlan,
  loadKit,
  parseAgents,
  planInit,
  resolveAnswer,
  resolveKitDir,
} from './agents/kit.js';

/**
 * 010-harness-neutral-importer: the importer core is deterministic and
 * model-free. Two subcommands, neither of which makes a model call or a network
 * request:
 *   import <config>          — review.yaml + arch.json from {repo}.analysis.json artifacts
 *   gather-context <config>  — write {repo}.context.json bundles for an external producer
 *   init --agent <names>     — install the analysis-producer procedure for a coding agent
 *
 * Exit codes: 0 = success (incl. per-repo skips / nothing to export),
 *             1 = config validation error or unexpected error.
 * (No "endpoint unreachable" code — the core never contacts an endpoint.)
 */

export interface ImportCommandOptions {
  output?: string;
  repos?: string;
  verbose?: boolean;
}

export interface GatherContextCommandOptions {
  out?: string;
  repos?: string;
}

export interface InitCommandOptions {
  agent?: string;
  dir?: string;
  dryRun?: boolean;
  /** Test/dev override for where the kit is read from. */
  kit?: string;
}

function reposFilter(csv: string | undefined): string[] | undefined {
  return csv?.split(',').map((s) => s.trim());
}

export async function runImportCommand(
  configFile: string,
  options: ImportCommandOptions
): Promise<number> {
  try {
    const config = await loadConfig(configFile);
    await runImport(config, {
      outputDirOverride: options.output,
      repoNamesFilter: reposFilter(options.repos),
      verbose: Boolean(options.verbose),
    });
    return 0;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      return 1;
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return 1;
  }
}

export async function runGatherContextCommand(
  configFile: string,
  options: GatherContextCommandOptions
): Promise<number> {
  try {
    const config = await loadConfig(configFile);
    const outDir = resolve(options.out ?? config.output.directory);
    await ensureOutputDir(outDir);

    const filter = reposFilter(options.repos);
    const selected = filter
      ? config.repositories.filter((r) => filter.includes(r.name ?? r.path))
      : config.repositories;

    for (const entry of selected) {
      const name = entry.name ?? entry.path.split('/').filter(Boolean).pop() ?? entry.path;
      const ctx = gatherContext(name, resolve(entry.path), entry.description);
      if (
        ctx.readmes.length === 0 &&
        ctx.manifests.length === 0 &&
        ctx.sourceExcerpts.length === 0
      ) {
        console.error(`[skip] ${name}: path not found or empty (${entry.path})`);
        continue;
      }
      const bundle = serializeContextBundle(ctx);
      const path = join(outDir, `${name}.context.json`);
      await writeFile(path, JSON.stringify(bundle, null, 2), 'utf8');
      console.error(
        `[done] ${name}: ${bundle.sourceExcerpts.length} source excerpt(s), ${bundle.totalBytes} bytes → ${path}`
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      return 1;
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return 1;
  }
}

/**
 * 014-component-layer-drilldown: `{repo}.components.json` is never read by
 * `import` (FR-010/FR-013), so — unlike `{repo}.analysis.json`, validated for
 * free as a side effect of `import` parsing every artifact — this is its one
 * explicit validation entrypoint. Synchronous: this command only ever reads
 * the one file it's given.
 */
export function runValidateComponentsCommand(file: string): number {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(
      `${file}: invalid JSON — ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
  const result = ComponentAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`${file}: schema validation failed\n${result.error.toString()}`);
    return 1;
  }
  console.log(`valid: ${file}`);
  return 0;
}

export interface AttachComponentsCommandOptions {
  container: string;
  output?: string;
}

/**
 * 014-component-layer-drilldown: merges a {repo}.components.json directly into
 * one named container of an existing .arch.json, in place by default. No
 * second persisted artifact — `.arch.json` is the one file that holds the
 * diagram before and after. Deterministic: id generation, layout placement and
 * JSON splicing are all done here, not left to the calling agent to hand-edit.
 */
export function runAttachComponentsCommand(
  archFile: string,
  componentsFile: string,
  options: AttachComponentsCommandOptions
): number {
  let archRaw: string;
  let componentsRaw: string;
  try {
    archRaw = readFileSync(archFile, 'utf8');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  try {
    componentsRaw = readFileSync(componentsFile, 'utf8');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  let model: ArchitectureModel;
  try {
    const parsedArch = JSON.parse(archRaw) as Partial<ArchitectureModel>;
    if (!Array.isArray(parsedArch.elements) || !Array.isArray(parsedArch.views)) {
      console.error(`${archFile}: does not look like an .arch.json (missing elements/views)`);
      return 1;
    }
    model = parsedArch as ArchitectureModel;
  } catch (error) {
    console.error(
      `${archFile}: invalid JSON — ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }

  let componentsJson: unknown;
  try {
    componentsJson = JSON.parse(componentsRaw);
  } catch (error) {
    console.error(
      `${componentsFile}: invalid JSON — ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
  const parsedComponents = ComponentAnalysisSchema.safeParse(componentsJson);
  if (!parsedComponents.success) {
    console.error(
      `${componentsFile}: schema validation failed\n${parsedComponents.error.toString()}`
    );
    return 1;
  }

  let updated: ArchitectureModel;
  try {
    updated = attachComponentsToModel(model, options.container, parsedComponents.data);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const outPath = options.output ?? archFile;
  writeFileSync(outPath, JSON.stringify(updated, null, 2));
  console.log(
    `updated: ${outPath} (+${parsedComponents.data.components.length} component(s), ` +
      `+${parsedComponents.data.relationships.length} relationship(s) in "${options.container}")`
  );
  return 0;
}

/** Ask which agents to set up (only when `--agent` is omitted at a terminal). */
async function promptForAgents(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(
      `Set up which coding agents?\n${agentMenu()}\nNumbers or names, comma-separated: `
    );
    return resolveAnswer(answer);
  } finally {
    rl.close();
  }
}

export function runInitCommand(options: InitCommandOptions): number {
  try {
    const agents = parseAgents(options.agent);
    const kit = loadKit(resolveKitDir(options.kit));
    const dir = resolve(options.dir ?? '.');
    const dryRun = Boolean(options.dryRun);
    for (const { path, action } of applyPlan(planInit(kit, agents, dir), { dryRun })) {
      console.log(`${dryRun ? '[dry-run] ' : ''}${action.padEnd(9)} ${path}`);
    }
    console.log(
      '\nNext: ask your agent to import this workspace with the arch-atlas-import procedure, ' +
        'pointing it at your import.yaml. It analyzes each repository, then runs `import` itself.'
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('archatlas')
    .description('Deterministic, model-free repository architecture importer');

  program
    .command('import')
    .description('Build review.yaml + arch.json from existing {repo}.analysis.json artifacts')
    .argument('<config-file>', 'Path to import config (.json or .yaml/.yml)')
    .option('--output <dir>', 'Override output directory from config')
    .option('--repos <names>', 'Comma-separated repo names to include (subset of config)')
    .option('--verbose', 'Print detailed progress', false)
    .action(async (configFile: string, options: ImportCommandOptions) => {
      const code = await runImportCommand(configFile, options);
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('gather-context')
    .description('Write {repo}.context.json bundles for an external analysis producer')
    .argument('<config-file>', 'Path to import config (.json or .yaml/.yml)')
    .option(
      '--out <dir>',
      'Directory for the context bundles (defaults to config output.directory)'
    )
    .option('--repos <names>', 'Comma-separated repo names to include (subset of config)')
    .action(async (configFile: string, options: GatherContextCommandOptions) => {
      const code = await runGatherContextCommand(configFile, options);
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('validate-components')
    .description('Validate one {repo}.components.json file against the schema')
    .argument('<file>', 'Path to a {repo}.components.json file')
    .action((file: string) => {
      const code = runValidateComponentsCommand(file);
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('attach-components')
    .description(
      'Merge a {repo}.components.json into one named container of an existing .arch.json, in place'
    )
    .argument('<arch-file>', 'Path to the .arch.json diagram file (edited in place by default)')
    .argument('<components-file>', 'Path to a {repo}.components.json file')
    .requiredOption('--container <name>', 'Name of the target container element')
    .option('--output <file>', 'Write to a different file instead of overwriting <arch-file>')
    .action((archFile: string, componentsFile: string, options: AttachComponentsCommandOptions) => {
      const code = runAttachComponentsCommand(archFile, componentsFile, options);
      if (code !== 0) process.exitCode = code;
    });

  program
    .command('init')
    .description(
      'Install the analysis-producer procedure for a coding agent (claude, copilot, cursor, codex, generic)'
    )
    .option('--agent <names>', 'Comma-separated agents to set up, or "all"')
    .option('--dir <path>', 'Workspace to install into', '.')
    .option('--dry-run', 'Show what would be written without writing', false)
    .action(async (options: InitCommandOptions) => {
      let resolved = options;
      if (!options.agent && process.stdin.isTTY) {
        try {
          resolved = { ...options, agent: await promptForAgents() };
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
          return;
        }
      }
      const code = runInitCommand(resolved);
      if (code !== 0) process.exitCode = code;
    });

  return program;
}

/**
 * True when this module is the process entry point. Compares realpath-resolved
 * paths so it still fires when invoked through the `archatlas` bin symlink that
 * npm / npx / pnpm create (a naive `file://${process.argv[1]}` check silently
 * no-ops there, and also breaks on paths containing spaces).
 */
function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exitCode = 1;
    });
}
