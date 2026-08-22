import fs from 'node:fs';
import path from 'node:path';
import { matchesSecretPattern } from '../../analysis/secret-paths.js';
import type { RepositoryKnowledgeGraph } from '../../graph/schema.js';
import type { RepoEvidence } from './types.js';
import { parseManifest } from './parsers/manifests.js';
import { isComposeFile, parseComposeFile } from './parsers/compose.js';
import { extractSchemaDigest, isSchemaish } from './parsers/schemas.js';
import { extractUrlLiterals } from './parsers/routes.js';
import { extractTopicRefs } from './parsers/topics.js';

/**
 * Evidence collection: the single correlation module that touches the
 * filesystem. Unlike the understand-everything original (which scanned only
 * files the per-repo graph referenced), this walks the repository tree
 * directly — a thin knowledge graph from a small local model must not starve
 * the deterministic passes of evidence. The walk is bounded (depth, file
 * count, file size) and applies the FR-015 secret-path exclusions, so we
 * never read a file the analysis agent itself would be blocked from reading.
 */

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES_SCANNED = 4000;
const MAX_DEPTH = 10;

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.rb',
  '.php',
  '.cs',
  '.swift',
  '.scala',
]);

/** Perf-only skips beyond the FR-015 list (which already covers node_modules,
 * .git, dist, build, coverage, __pycache__, .venv, venv). */
const SKIP_DIRS = new Set(['target', 'vendor', '.next', '.turbo', '.idea', '.vscode', 'out']);

const MANIFEST_OR_COMPOSE_BASENAMES = new Set([
  'package.json',
  'pyproject.toml',
  'go.mod',
  'cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
]);

function isInterestingFile(relPath: string): boolean {
  const base = (relPath.split('/').pop() ?? '').toLowerCase();
  if (MANIFEST_OR_COMPOSE_BASENAMES.has(base)) return true;
  if (isComposeFile(relPath)) return true;
  if (isSchemaish(relPath)) return true;
  return CODE_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function readCapped(absPath: string): string | null {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

/** Depth- and count-bounded walk yielding repo-relative paths of interesting files. */
function walkRepo(repoRoot: string): string[] {
  const found: string[] = [];
  const queue: Array<{ abs: string; rel: string; depth: number }> = [
    { abs: repoRoot, rel: '', depth: 0 },
  ];
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_FILES_SCANNED) {
    const dir = queue.shift();
    if (!dir) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = dir.rel ? `${dir.rel}/${entry.name}` : entry.name;
      if (matchesSecretPattern(rel)) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) continue;
        if (dir.depth + 1 <= MAX_DEPTH)
          queue.push({ abs: path.join(dir.abs, entry.name), rel, depth: dir.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      scanned++;
      if (isInterestingFile(rel)) found.push(rel);
      if (scanned >= MAX_FILES_SCANNED) break;
    }
  }
  return found.sort();
}

/** Resolve the on-disk root for a repo from its artifact, if still present. */
function resolveRepoRoot(graph: RepositoryKnowledgeGraph): string | null {
  const recorded = graph.repository.path;
  if (!recorded || !path.isAbsolute(recorded)) return null;
  try {
    return fs.statSync(recorded).isDirectory() ? recorded : null;
  } catch {
    return null;
  }
}

export function collectRepoEvidence(graph: RepositoryKnowledgeGraph): RepoEvidence {
  const repoName = graph.repository.name;
  const evidence: RepoEvidence = {
    name: repoName,
    root: null,
    manifests: [],
    composeFiles: [],
    schemaDigests: [],
    endpointNodes: graph.nodes.filter((n) => n.type === 'endpoint'),
    topicRefs: [],
    urlLiterals: [],
  };

  const repoRoot = resolveRepoRoot(graph);
  if (repoRoot === null) return evidence;

  evidence.root = repoRoot;
  for (const rel of walkRepo(repoRoot)) {
    const content = readCapped(path.join(repoRoot, rel));
    if (content === null) continue;

    const manifest = parseManifest(rel, content);
    if (manifest) evidence.manifests.push(manifest);

    if (isComposeFile(rel)) {
      const compose = parseComposeFile(rel, content);
      if (compose) evidence.composeFiles.push(compose);
    }

    if (isSchemaish(rel)) {
      evidence.schemaDigests.push({ relPath: rel, ...extractSchemaDigest(rel, content) });
    }

    if (CODE_EXTENSIONS.has(path.extname(rel).toLowerCase())) {
      evidence.urlLiterals.push(...extractUrlLiterals(rel, content));
      evidence.topicRefs.push(...extractTopicRefs(rel, content));
    }
  }

  return evidence;
}

export function collectEvidence(graphs: RepositoryKnowledgeGraph[]): RepoEvidence[] {
  return graphs.map((graph) => collectRepoEvidence(graph));
}
