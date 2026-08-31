import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RepoAnalysisSchema, type RepoAnalysis } from './repo-analysis.schema.js';

/**
 * 008: read/write the per-repository analysis artifact
 * `{output.directory}/{repo-name}.analysis.json`. Every read validates against
 * `RepoAnalysisSchema`; `writeAnalysis` refuses to persist an invalid object
 * (FR-006).
 */

const SUFFIX = '.analysis.json';
const LEGACY_SUFFIX = '.knowledge-graph.json';

function artifactPath(outputDir: string, repoName: string): string {
  return join(outputDir, `${repoName}${SUFFIX}`);
}

export async function hasValidCachedAnalysis(
  outputDir: string,
  repoName: string
): Promise<boolean> {
  const path = artifactPath(outputDir, repoName);
  try {
    await access(path);
  } catch {
    return false;
  }
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return RepoAnalysisSchema.safeParse(raw).success;
  } catch {
    return false;
  }
}

export async function readAnalysis(outputDir: string, repoName: string): Promise<RepoAnalysis> {
  const raw: unknown = JSON.parse(await readFile(artifactPath(outputDir, repoName), 'utf8'));
  return RepoAnalysisSchema.parse(raw);
}

export type TryReadAnalysisResult =
  | { ok: true; analysis: RepoAnalysis }
  | { ok: false; reason: 'missing' | 'invalid'; detail?: string };

/**
 * 010: per-configured-repo artifact intake for the model-free `import` command.
 * Never throws — a missing or malformed `{repo}.analysis.json` is reported and
 * the repository is skipped (FR-003).
 */
export async function tryReadAnalysis(
  outputDir: string,
  repoName: string
): Promise<TryReadAnalysisResult> {
  let contents: string;
  try {
    contents = await readFile(artifactPath(outputDir, repoName), 'utf8');
  } catch {
    return { ok: false, reason: 'missing' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    return { ok: false, reason: 'invalid', detail: 'not valid JSON' };
  }
  const parsed = RepoAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      detail: parsed.error.issues[0]?.message ?? 'schema mismatch',
    };
  }
  return { ok: true, analysis: parsed.data };
}

export async function writeAnalysis(outputDir: string, analysis: RepoAnalysis): Promise<string> {
  RepoAnalysisSchema.parse(analysis); // throws on invalid — never persist bad data
  await mkdir(outputDir, { recursive: true });
  const path = artifactPath(outputDir, analysis.repository.name);
  await writeFile(path, JSON.stringify(analysis, null, 2), 'utf8');
  return path;
}

export async function listAllAnalyses(outputDir: string): Promise<RepoAnalysis[]> {
  let entries: string[];
  try {
    entries = await readdir(outputDir);
  } catch {
    return [];
  }

  const out: RepoAnalysis[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(SUFFIX)) continue;
    try {
      const raw: unknown = JSON.parse(await readFile(join(outputDir, entry), 'utf8'));
      const parsed = RepoAnalysisSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    } catch {
      // skip unreadable/corrupt artifacts rather than fail the whole load
    }
  }

  if (out.length === 0 && entries.some((e) => e.endsWith(LEGACY_SUFFIX))) {
    console.error(
      `note: found ${LEGACY_SUFFIX} artifacts from a previous (007) version in ${outputDir} — ` +
        `these are a different format and are ignored. Re-run analysis to produce ${SUFFIX} artifacts.`
    );
  }

  return out;
}

export async function ensureOutputDir(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
}
