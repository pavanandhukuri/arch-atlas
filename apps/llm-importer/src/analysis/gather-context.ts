import fs from 'node:fs';
import path from 'node:path';
import { matchesSecretPattern } from './secret-paths.js';
import { extractUrlLiterals } from '../correlate/evidence/parsers/routes.js';
import { extractTopicRefs } from '../correlate/evidence/parsers/topics.js';
import {
  MAX_DEPTH,
  MAX_FILES_EXAMINED,
  MAX_LISTING_ENTRIES,
  MAX_MANIFEST_BYTES,
  MAX_MANIFEST_TOTAL_BYTES,
  MAX_README_BYTES,
  MAX_README_FILES,
  MAX_README_TOTAL_BYTES,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_FILES,
  MAX_TOTAL_CONTEXT_BYTES,
} from './context-limits.js';

/**
 * 008 research.md D2: deterministic assembly of the fixed context handed to the
 * bounded analysis call. No model, no tools. Mirrors the bounded-walk discipline
 * of `src/correlate/evidence/collect.ts` (depth / count caps, secret exclusion,
 * perf-skip dirs) but is a separate consumer, so the walk logic is duplicated
 * rather than shared — `collect.ts` stays on the "unchanged" list.
 */

export interface ContextFile {
  relPath: string;
  text: string;
}

export interface SourceExcerpt {
  relPath: string;
  text: string;
  truncated: boolean;
}

/** research.md D14.2: dependency lists pulled out of a JSON manifest so the
 * model can tell a runtime framework from a build/test tool. */
export interface DependencySplit {
  relPath: string;
  dependencies: string[];
  devDependencies: string[];
  peerDependencies: string[];
}

/** research.md D14.5: interface hints extracted deterministically from the
 * source excerpts — the model is asked to confirm/refine/classify these
 * rather than discover from scratch. */
export interface DetectedInterfaces {
  httpRoutes: Array<{ method?: string; path: string; relPath: string; line: number }>;
  topics: Array<{ name: string; role: 'pub' | 'sub' | 'unknown'; relPath: string; line: number }>;
}

export interface AnalysisContext {
  repoName: string;
  repoPath: string;
  descriptionHint: string | undefined;
  readmes: ContextFile[];
  manifests: ContextFile[];
  dependencySplits: DependencySplit[];
  listing: string[];
  sourceExcerpts: SourceExcerpt[];
  detected: DetectedInterfaces;
  totalBytes: number;
}

/** Perf-only skips beyond the FR-003 secret list (which already covers
 * node_modules, .git, dist, build, coverage, __pycache__, .venv, venv). Matches
 * the set in `correlate/evidence/collect.ts`. */
const SKIP_DIRS = new Set([
  'target',
  'vendor',
  '.next',
  '.turbo',
  '.idea',
  '.vscode',
  'out',
  'node_modules',
]);

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

const MANIFEST_BASENAMES = new Set([
  'package.json',
  'pyproject.toml',
  'go.mod',
  'cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'requirements.txt',
  'gemfile',
  'composer.json',
  'dockerfile',
]);

const README_RE = /^readme(\.[a-z0-9]+)?$/i;
const DOCS_README_RE = /^docs\/(readme|index|overview|architecture)\.(md|markdown|rst|txt)$/i;
const COMPOSE_RE = /^docker-compose(\.[\w-]+)?\.ya?ml$/i;
const CSPROJ_RE = /\.csproj$/i;

/** Entry-point-ish basenames → strong relevance. */
const ENTRYPOINT_BASENAMES = [
  /^main\.[a-z]+$/i,
  /^index\.[a-z]+$/i,
  /^app\.[a-z]+$/i,
  /^server\.[a-z]+$/i,
  /^program\.cs$/i,
  /^__main__\.py$/i,
];

/** Path segments that hint at an external-interface site → medium relevance. */
const INTERFACE_SEGMENT_RE =
  /(^|\/)(routes?|router|handlers?|controllers?|endpoints?|api|consumers?|producers?|publishers?|subscribers?|listeners?|workers?|queue|kafka|grpc|proto|schema)(\/|s?\.|$)/i;

function readCapped(absPath: string, cap: number): { text: string; truncated: boolean } | null {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) return null;
    const buf = fs.readFileSync(absPath);
    if (buf.length <= cap) return { text: buf.toString('utf8'), truncated: false };
    return { text: buf.subarray(0, cap).toString('utf8'), truncated: true };
  } catch {
    return null;
  }
}

interface WalkHit {
  relPath: string;
  depth: number;
}

/** Depth- and count-bounded BFS yielding repo-relative file paths. */
function walkRepo(repoRoot: string): WalkHit[] {
  const found: WalkHit[] = [];
  const queue: Array<{ abs: string; rel: string; depth: number }> = [
    { abs: repoRoot, rel: '', depth: 0 },
  ];
  let examined = 0;

  while (queue.length > 0 && examined < MAX_FILES_EXAMINED) {
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
        if (dir.depth + 1 <= MAX_DEPTH) {
          queue.push({ abs: path.join(dir.abs, entry.name), rel, depth: dir.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) continue;
      examined++;
      found.push({ relPath: rel, depth: dir.depth + 1 });
      if (examined >= MAX_FILES_EXAMINED) break;
    }
  }
  return found.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function isReadme(relPath: string, depth: number): boolean {
  if (depth > 2) return false;
  const base = relPath.split('/').pop() ?? '';
  if (README_RE.test(base)) return true;
  // A small, named set of docs/ entry points — NOT every markdown file under
  // docs/, which on a large repo would drown out the source excerpts.
  return DOCS_README_RE.test(relPath);
}

function isManifest(relPath: string): boolean {
  const base = (relPath.split('/').pop() ?? '').toLowerCase();
  if (MANIFEST_BASENAMES.has(base)) return true;
  if (COMPOSE_RE.test(base)) return true;
  return CSPROJ_RE.test(base);
}

function relevanceScore(hit: WalkHit): number {
  const base = hit.relPath.split('/').pop() ?? '';
  if (!CODE_EXTENSIONS.has(path.extname(base).toLowerCase())) return 0;
  let score = 1;
  if (ENTRYPOINT_BASENAMES.some((re) => re.test(base))) score += 100;
  if (/(^|\/)cmd\/[^/]+\/main\.go$/i.test(hit.relPath)) score += 100;
  if (/(^|\/)src\/main\//i.test(hit.relPath)) score += 40;
  if (INTERFACE_SEGMENT_RE.test(hit.relPath)) score += 30;
  // shallower is better
  score += Math.max(0, 6 - hit.depth);
  return score;
}

export function gatherContext(
  repoName: string,
  repoPath: string,
  descriptionHint?: string
): AnalysisContext {
  const ctx: AnalysisContext = {
    repoName,
    repoPath,
    descriptionHint,
    readmes: [],
    manifests: [],
    dependencySplits: [],
    listing: [],
    sourceExcerpts: [],
    detected: { httpRoutes: [], topics: [] },
    totalBytes: 0,
  };

  let root: string;
  try {
    if (!fs.statSync(repoPath).isDirectory()) return ctx;
    root = repoPath;
  } catch {
    return ctx;
  }

  const hits = walkRepo(root);
  ctx.listing = hits.map((h) => h.relPath).slice(0, MAX_LISTING_ENTRIES);

  // Shallowest-first so a repo with many nested READMEs keeps the root one.
  const byDepthThenPath = (a: WalkHit, b: WalkHit): number =>
    a.depth - b.depth || a.relPath.localeCompare(b.relPath);

  // --- READMEs: own file-count + byte budget -----------------------------
  let readmeBytes = 0;
  for (const hit of hits.filter((h) => isReadme(h.relPath, h.depth)).sort(byDepthThenPath)) {
    if (ctx.readmes.length >= MAX_README_FILES) break;
    const read = readCapped(path.join(root, hit.relPath), MAX_README_BYTES);
    if (!read || readmeBytes + read.text.length > MAX_README_TOTAL_BYTES) continue;
    readmeBytes += read.text.length;
    ctx.readmes.push({ relPath: hit.relPath, text: read.text });
  }

  // --- Manifests: own byte budget --------------------------------------
  let manifestBytes = 0;
  for (const hit of hits.filter((h) => isManifest(h.relPath)).sort(byDepthThenPath)) {
    const read = readCapped(path.join(root, hit.relPath), MAX_MANIFEST_BYTES);
    if (!read || manifestBytes + read.text.length > MAX_MANIFEST_TOTAL_BYTES) continue;
    manifestBytes += read.text.length;
    ctx.manifests.push({ relPath: hit.relPath, text: read.text });
    const split = parseDependencySplit(hit.relPath, read.text);
    if (split) ctx.dependencySplits.push(split);
  }

  ctx.totalBytes = readmeBytes + manifestBytes;

  // --- Source excerpts: whatever remains under the overall ceiling ------
  const ranked = hits
    .map((hit) => ({ hit, score: relevanceScore(hit) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.hit.relPath.localeCompare(b.hit.relPath))
    .slice(0, MAX_SOURCE_FILES);

  for (const { hit } of ranked) {
    const read = readCapped(path.join(root, hit.relPath), MAX_SOURCE_BYTES);
    if (!read) continue;
    if (ctx.totalBytes + read.text.length > MAX_TOTAL_CONTEXT_BYTES) break;
    ctx.totalBytes += read.text.length;
    ctx.sourceExcerpts.push({
      relPath: hit.relPath,
      text: read.text,
      truncated: read.truncated,
    });
  }

  ctx.detected = detectInterfaces(ctx.sourceExcerpts);
  return ctx;
}

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

/** Pull dependency/devDependency/peerDependency name lists out of a JSON
 * manifest (package.json / composer.json). Non-JSON manifests return null —
 * the raw text still goes to the model via `ctx.manifests`. */
export function parseDependencySplit(relPath: string, text: string): DependencySplit | null {
  const base = (relPath.split('/').pop() ?? '').toLowerCase();
  if (base !== 'package.json' && base !== 'composer.json') return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  const names = (key: string): string[] => {
    const v = obj[key];
    return v && typeof v === 'object' ? Object.keys(v as Record<string, unknown>).sort() : [];
  };
  const [dependencies, devDependencies, peerDependencies] = DEP_KEYS.map(names);
  if (
    (dependencies?.length ?? 0) +
      (devDependencies?.length ?? 0) +
      (peerDependencies?.length ?? 0) ===
    0
  ) {
    return null;
  }
  return {
    relPath,
    dependencies: dependencies ?? [],
    devDependencies: devDependencies ?? [],
    peerDependencies: peerDependencies ?? [],
  };
}

const MAX_DETECTED_ROUTES = 40;
const MAX_DETECTED_TOPICS = 30;

/** Deterministic first pass over the source excerpts (research.md D14.5). */
export function detectInterfaces(excerpts: SourceExcerpt[]): DetectedInterfaces {
  const routes = new Map<string, DetectedInterfaces['httpRoutes'][number]>();
  const topics = new Map<string, DetectedInterfaces['topics'][number]>();
  for (const ex of excerpts) {
    if (!CODE_EXTENSIONS.has(path.extname(ex.relPath).toLowerCase())) continue;
    for (const u of extractUrlLiterals(ex.relPath, ex.text)) {
      const key = `${u.method ?? ''} ${u.path}`;
      if (!routes.has(key)) {
        routes.set(key, {
          ...(u.method !== undefined ? { method: u.method } : {}),
          path: u.path,
          relPath: u.relPath,
          line: u.line,
        });
      }
    }
    for (const t of extractTopicRefs(ex.relPath, ex.text)) {
      if (!topics.has(t.topic)) {
        topics.set(t.topic, { name: t.topic, role: t.role, relPath: t.relPath, line: t.line });
      }
    }
  }
  return {
    httpRoutes: [...routes.values()].slice(0, MAX_DETECTED_ROUTES),
    topics: [...topics.values()].slice(0, MAX_DETECTED_TOPICS),
  };
}
