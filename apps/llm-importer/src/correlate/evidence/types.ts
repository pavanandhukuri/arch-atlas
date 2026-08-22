import type { GraphNode } from '../../graph/schema.js';

/**
 * Raw-source evidence types for the deterministic correlation passes.
 *
 * Ported from the understand-everything project's linker core
 * (packages/core/src/linkers/types.ts) — the evidence-grounded
 * cross-repository linking machinery developed against Understand-Anything
 * workspaces, adapted here to arch-atlas's trimmed knowledge-graph schema.
 */

export interface ManifestDependency {
  name: string;
  version?: string;
  /** Local specifier (file:/link:/workspace:/path=/replace) target, when present. */
  localPath?: string;
}

export interface ManifestInfo {
  ecosystem: 'npm' | 'python' | 'go' | 'rust' | 'maven' | 'gradle';
  /** Path of the manifest relative to the repo root. */
  relPath: string;
  /** Names this manifest publishes (npm name, go module path, maven g:a). */
  publishedNames: string[];
  dependencies: ManifestDependency[];
}

export interface ComposeService {
  name: string;
  buildContext?: string;
  image?: string;
  environment: Record<string, string>;
  dependsOn: string[];
}

export interface ComposeInfo {
  relPath: string;
  services: ComposeService[];
}

export interface SchemaDigest {
  relPath: string;
  sha256: string;
  /** e.g. proto package + message names, GraphQL type names, OpenAPI title+operationIds. */
  identifiers: string[];
  /** Normalized route paths for OpenAPI docs; empty otherwise. */
  openapiPaths: string[];
}

export interface UrlLiteral {
  /** File path relative to the repo root. */
  relPath: string;
  line: number;
  /** Normalized route path (origin stripped, params collapsed to '*'). */
  path: string;
  /** Upper-case HTTP method when the callsite reveals it. */
  method?: string;
  /** True when the literal was a template string with interpolation. */
  template: boolean;
}

export interface TopicRef {
  relPath: string;
  line: number;
  topic: string;
  /** "unknown" = a bare `topic=` style reference whose direction isn't inferable. */
  role: 'pub' | 'sub' | 'unknown';
}

export interface RepoEvidence {
  name: string;
  /** Absolute repo root the evidence was collected from; null when the
   * artifact's recorded path was unavailable on this machine (correlation
   * then degrades to graph-only passes for this repo). */
  root: string | null;
  manifests: ManifestInfo[];
  composeFiles: ComposeInfo[];
  schemaDigests: SchemaDigest[];
  /** Endpoint nodes from the repo's knowledge graph (agent-extracted). */
  endpointNodes: GraphNode[];
  topicRefs: TopicRef[];
  urlLiterals: UrlLiteral[];
}
