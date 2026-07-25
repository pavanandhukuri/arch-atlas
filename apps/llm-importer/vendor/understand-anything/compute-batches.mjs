#!/usr/bin/env node
/**
 * arch-atlas replacement for Understand-Anything's compute-batches.mjs.
 *
 * The original script does import-graph-aware batching via `graphology` +
 * `graphology-communities-louvain`, backed by `@understand-anything/core`'s
 * bundled tree-sitter grammars (research.md D4 — not vendored; that package
 * isn't published to npm and pulls in a dozen native/WASM grammar packages
 * for a capability our pipeline doesn't need, since we don't rely on
 * cross-batch import-confidence boosting the way UA's dashboard does).
 *
 * This version does plain, dependency-free chunking: fixed-size batches in
 * scan order. `batchImportData` and `neighborMap` are emitted as empty
 * objects so SKILL.md's Phase 2 dispatch-prompt template (which interpolates
 * them directly) still substitutes cleanly — the file-analyzer agent falls
 * back to resolving imports from file content it reads directly, which it
 * already does as part of normal analysis.
 *
 * Usage: node compute-batches.mjs <projectRoot> [--changed-files=<path>]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BATCH_SIZE = 20;

function parseArgs(argv) {
  const projectRoot = argv[2];
  if (!projectRoot) {
    console.error('Usage: compute-batches.mjs <projectRoot> [--changed-files=<path>]');
    process.exit(1);
  }
  const changedFilesFlag = argv.find((a) => a.startsWith('--changed-files='));
  const changedFilesPath = changedFilesFlag ? changedFilesFlag.slice('--changed-files='.length) : null;
  return { projectRoot, changedFilesPath };
}

function resolveUaDir(projectRoot) {
  // Mirrors SKILL.md Phase 0 step 1.7's own $UA_DIR resolution logic.
  return join(projectRoot, '.ua');
}

async function main() {
  const { projectRoot, changedFilesPath } = parseArgs(process.argv);
  const uaDir = resolveUaDir(projectRoot);
  const scanResultPath = join(uaDir, 'intermediate', 'scan-result.json');

  const scanResult = JSON.parse(await readFile(scanResultPath, 'utf8'));
  let files = Array.isArray(scanResult.files) ? scanResult.files : [];

  if (changedFilesPath) {
    const changedRaw = await readFile(changedFilesPath, 'utf8');
    const changedSet = new Set(
      changedRaw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
    files = files.filter((f) => changedSet.has(f.path));
    if (files.length === 0) {
      await writeFile(join(uaDir, 'intermediate', 'batches.json'), JSON.stringify([], null, 2));
      console.error('No changed files require analysis.');
      return;
    }
  }

  const batches = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }
  const totalBatches = batches.length;

  const output = batches.map((batchFiles, index) => ({
    batchIndex: index + 1,
    totalBatches,
    files: batchFiles.map((f) => ({
      path: f.path,
      language: f.language,
      sizeLines: f.sizeLines,
      fileCategory: f.fileCategory,
    })),
    // Intentionally empty — see file header. Not a bug: the file-analyzer
    // agent resolves imports/cross-batch references from file content itself.
    batchImportData: {},
    neighborMap: {},
  }));

  await writeFile(join(uaDir, 'intermediate', 'batches.json'), JSON.stringify(output, null, 2));
  console.error(`Computed ${totalBatches} batch(es) of up to ${BATCH_SIZE} files each (plain chunking, no import-graph analysis).`);
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
