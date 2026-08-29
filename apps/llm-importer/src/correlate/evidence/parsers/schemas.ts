import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { normalizeRoutePath } from './routes.js';

/**
 * Schema identifier extraction — regex-level, per format. Ported from
 * understand-everything's linker core (yaml package swapped for js-yaml,
 * which this package already depends on).
 */

export interface SchemaExtraction {
  sha256: string;
  identifiers: string[];
  openapiPaths: string[];
}

export function sha256Of(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function protoIdentifiers(content: string): string[] {
  const ids: string[] = [];
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(content);
  if (pkg?.[1]) ids.push(`package:${pkg[1]}`);
  for (const m of content.matchAll(/^\s*message\s+(\w+)/gm)) {
    if (m[1]) ids.push(`message:${m[1]}`);
  }
  for (const m of content.matchAll(/^\s*service\s+(\w+)/gm)) {
    if (m[1]) ids.push(`service:${m[1]}`);
  }
  return ids;
}

function graphqlIdentifiers(content: string): string[] {
  const ids: string[] = [];
  for (const m of content.matchAll(/^\s*(?:type|interface|enum|input|union|scalar)\s+(\w+)/gm)) {
    if (m[1]) ids.push(`type:${m[1]}`);
  }
  return ids;
}

interface OpenApiDoc {
  openapi?: unknown;
  swagger?: unknown;
  info?: { title?: unknown };
  // Values may be null in malformed-but-parseable YAML — typed honestly so
  // the guards below stay both lint-clean and runtime-safe.
  paths?: Record<string, Record<string, { operationId?: unknown } | null> | null>;
}

function openapiExtraction(content: string): { identifiers: string[]; paths: string[] } | null {
  let doc: OpenApiDoc | null | undefined;
  try {
    doc = (content.trimStart().startsWith('{') ? JSON.parse(content) : yaml.load(content)) as
      | OpenApiDoc
      | null
      | undefined;
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || (!doc.openapi && !doc.swagger)) return null;
  const identifiers: string[] = [];
  if (typeof doc.info?.title === 'string') identifiers.push(`title:${doc.info.title}`);
  const paths: string[] = [];
  for (const [route, ops] of Object.entries(doc.paths ?? {})) {
    const normalized = normalizeRoutePath(route);
    if (normalized) paths.push(normalized);
    for (const op of Object.values(ops ?? {})) {
      if (op && typeof op.operationId === 'string') identifiers.push(`operation:${op.operationId}`);
    }
  }
  return { identifiers, paths: [...new Set(paths)].sort() };
}

/**
 * Extract digest + identifiers for a schema-ish file. Unknown formats still
 * get a content hash (identical-copy detection works for any format).
 */
export function extractSchemaDigest(relPath: string, content: string): SchemaExtraction {
  const sha256 = sha256Of(content);
  const lower = relPath.toLowerCase();

  if (lower.endsWith('.proto')) {
    return { sha256, identifiers: protoIdentifiers(content), openapiPaths: [] };
  }
  if (lower.endsWith('.graphql') || lower.endsWith('.graphqls') || lower.endsWith('.gql')) {
    return { sha256, identifiers: graphqlIdentifiers(content), openapiPaths: [] };
  }
  if (/\.(ya?ml|json)$/.test(lower)) {
    const openapi = openapiExtraction(content);
    if (openapi) {
      return { sha256, identifiers: openapi.identifiers, openapiPaths: openapi.paths };
    }
  }
  return { sha256, identifiers: [], openapiPaths: [] };
}

/** Files worth digesting regardless of how the agent typed them. */
export function isSchemaish(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  const base = lower.split('/').pop() ?? '';
  return (
    lower.endsWith('.proto') ||
    lower.endsWith('.graphql') ||
    lower.endsWith('.graphqls') ||
    lower.endsWith('.gql') ||
    lower.endsWith('.avsc') ||
    /^(openapi|swagger)[^/]*\.(ya?ml|json)$/.test(base)
  );
}
