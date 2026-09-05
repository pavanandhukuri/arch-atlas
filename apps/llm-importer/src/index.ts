/**
 * Public entrypoint for `@arch-atlas/llm-importer` (010-harness-neutral-importer).
 *
 * The importer is a deterministic, model-free library + CLI. This module is the
 * contract surface an analysis *producer* (e.g. the `plugins/repo-analysis`
 * skill/plugin — usable from any AGENTS.md-aware coding agent — or a third-party
 * script) depends on: bounded context gathering, the artifact schemas, the
 * correlation graph shape, and the analysis/extra-connections stores. Nothing
 * here makes a model call or a network request.
 */

export {
  gatherContext,
  parseDependencySplit,
  detectInterfaces,
} from './analysis/gather-context.js';
export type {
  AnalysisContext,
  ContextFile,
  SourceExcerpt,
  DependencySplit,
  DetectedInterfaces,
} from './analysis/gather-context.js';

export {
  serializeContextBundle,
  readContextBundle,
  ContextBundleSchema,
  ContextBundleVersionError,
} from './analysis/context-bundle.js';
export type { ContextBundle } from './analysis/context-bundle.js';

export {
  RepoAnalysisSchema,
  ModelAnalysisSchema,
  ServedInterfacesSchema,
  OutboundIntentSchema,
} from './analysis/repo-analysis.schema.js';
export type {
  RepoAnalysis,
  ModelAnalysis,
  ServedInterfaces,
  OutboundIntent,
  HttpRoute,
} from './analysis/repo-analysis.schema.js';

export {
  readAnalysis,
  writeAnalysis,
  hasValidCachedAnalysis,
  listAllAnalyses,
  ensureOutputDir,
} from './analysis/analysis-store.js';

export { toCorrelationGraph } from './analysis/to-correlation-graph.js';

export { correlateDeterministically } from './correlate/deterministic-correlator.js';
export type {
  CrossRepositoryConnection,
  UnresolvedRepoPair,
  DeterministicCorrelationResult,
} from './correlate/deterministic-correlator.js';

export {
  readExtraConnections,
  ExtraConnectionsSchema,
  EXTRA_CONNECTIONS_FILE,
  EXTRA_CONNECTIONS_VERSION,
} from './correlate/extra-connections.js';

export {
  RepositoryKnowledgeGraphSchema,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
} from './graph/schema.js';
export type {
  RepositoryKnowledgeGraph,
  GraphEdgeType,
  GraphNodeType,
  GraphNode,
  GraphEdge,
  RepositoryRef,
} from './graph/schema.js';

export { loadConfig, ConfigValidationError } from './config/loader.js';
export { ImportConfigSchema, CONFIG_VERSION } from './config/config.schema.js';
export type { ImportConfig, OutputConfig, RepositoryEntry } from './config/config.schema.js';
