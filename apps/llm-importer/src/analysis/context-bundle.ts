import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { matchesSecretPattern } from './secret-paths.js';
import type { AnalysisContext } from './gather-context.js';

/**
 * 010-harness-neutral-importer: the on-disk serialisation of `gatherContext()`'s
 * `AnalysisContext`, plus a version tag. This is the deterministic, secret-safe
 * *input* an analysis producer consumes (`{repo}.context.json`). The importer
 * core writes it via the `gather-context` subcommand; nothing here calls a model.
 *
 * `gather-context.ts` interfaces are the source of truth for the TS types; these
 * schemas validate the persisted form. See
 * `specs/010-harness-neutral-importer/contracts/context-bundle-contract.md`.
 */

export const CONTEXT_BUNDLE_VERSION = '1.0';

const ContextFileSchema = z.object({
  relPath: z.string().min(1),
  text: z.string(),
});

const SourceExcerptSchema = ContextFileSchema.extend({
  truncated: z.boolean(),
});

const DependencySplitSchema = z.object({
  relPath: z.string().min(1),
  dependencies: z.array(z.string()),
  devDependencies: z.array(z.string()),
  peerDependencies: z.array(z.string()),
});

const DetectedInterfacesSchema = z.object({
  httpRoutes: z.array(
    z.object({
      method: z.string().optional(),
      path: z.string(),
      relPath: z.string(),
      line: z.number().int(),
    })
  ),
  topics: z.array(
    z.object({
      name: z.string(),
      role: z.enum(['pub', 'sub', 'unknown']),
      relPath: z.string(),
      line: z.number().int(),
    })
  ),
});

export const ContextBundleSchema = z.object({
  schemaVersion: z.literal(CONTEXT_BUNDLE_VERSION),
  generatedAt: z.string(),
  repoName: z.string().min(1),
  repoPath: z.string().min(1),
  descriptionHint: z.string().optional(),
  readmes: z.array(ContextFileSchema),
  manifests: z.array(ContextFileSchema),
  dependencySplits: z.array(DependencySplitSchema),
  listing: z.array(z.string()),
  sourceExcerpts: z.array(SourceExcerptSchema),
  detected: DetectedInterfacesSchema,
  totalBytes: z.number().int().nonnegative(),
});
export type ContextBundle = z.infer<typeof ContextBundleSchema>;

export class ContextBundleVersionError extends Error {
  constructor(found: string, path: string) {
    super(
      `${path}: context bundle schemaVersion "${found}" is not supported ` +
        `(expected "${CONTEXT_BUNDLE_VERSION}"). Regenerate it with \`arch-atlas-import gather-context\`.`
    );
    this.name = 'ContextBundleVersionError';
  }
}

/** Every repo-relative path carried in a bundle — for the secret-path re-assertion. */
function bundleRelPaths(bundle: {
  readmes: Array<{ relPath: string }>;
  manifests: Array<{ relPath: string }>;
  dependencySplits: Array<{ relPath: string }>;
  sourceExcerpts: Array<{ relPath: string }>;
  listing: string[];
}): string[] {
  return [
    ...bundle.readmes.map((f) => f.relPath),
    ...bundle.manifests.map((f) => f.relPath),
    ...bundle.dependencySplits.map((d) => d.relPath),
    ...bundle.sourceExcerpts.map((e) => e.relPath),
    ...bundle.listing,
  ];
}

/**
 * Serialise a gathered context to the persisted bundle shape. A structural copy
 * plus `schemaVersion` / `generatedAt`. Re-asserts the FR-005 secret exclusion:
 * `gatherContext` never yields an excluded path, so a hit here is a bug, not a
 * user error — throw.
 */
export function serializeContextBundle(ctx: AnalysisContext): ContextBundle {
  const bundle: ContextBundle = {
    schemaVersion: CONTEXT_BUNDLE_VERSION,
    generatedAt: new Date().toISOString(),
    repoName: ctx.repoName,
    repoPath: ctx.repoPath,
    ...(ctx.descriptionHint !== undefined ? { descriptionHint: ctx.descriptionHint } : {}),
    readmes: ctx.readmes.map((f) => ({ relPath: f.relPath, text: f.text })),
    manifests: ctx.manifests.map((f) => ({ relPath: f.relPath, text: f.text })),
    dependencySplits: ctx.dependencySplits.map((d) => ({
      relPath: d.relPath,
      dependencies: [...d.dependencies],
      devDependencies: [...d.devDependencies],
      peerDependencies: [...d.peerDependencies],
    })),
    listing: [...ctx.listing],
    sourceExcerpts: ctx.sourceExcerpts.map((e) => ({
      relPath: e.relPath,
      text: e.text,
      truncated: e.truncated,
    })),
    detected: {
      httpRoutes: ctx.detected.httpRoutes.map((r) => ({ ...r })),
      topics: ctx.detected.topics.map((t) => ({ ...t })),
    },
    totalBytes: ctx.totalBytes,
  };

  const leaked = bundleRelPaths(bundle).find((p) => matchesSecretPattern(p));
  if (leaked !== undefined) {
    throw new Error(
      `serializeContextBundle: refusing to serialise — excluded path "${leaked}" reached the bundle`
    );
  }
  return bundle;
}

/** Read + validate a `{repo}.context.json`. Version mismatch → `ContextBundleVersionError`. */
export function readContextBundle(path: string): ContextBundle {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'schemaVersion' in raw &&
    (raw as { schemaVersion: unknown }).schemaVersion !== CONTEXT_BUNDLE_VERSION
  ) {
    throw new ContextBundleVersionError(
      String((raw as { schemaVersion: unknown }).schemaVersion),
      path
    );
  }
  return ContextBundleSchema.parse(raw);
}
