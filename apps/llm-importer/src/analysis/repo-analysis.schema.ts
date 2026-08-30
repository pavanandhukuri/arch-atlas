import { z } from 'zod';

/**
 * 008-bounded-repo-analysis: the per-repository analysis artifact, written to
 * `{output.directory}/{repo-name}.analysis.json`. Successor to 007's
 * `RepositoryKnowledgeGraph` artifact — a short, honest description of a
 * repository's identity and external interfaces rather than a deep
 * file/function/class graph. See `contracts/repo-analysis-schema.md`.
 *
 * `ModelAnalysisSchema` is the subset the bounded model call is asked to
 * produce; `analyze-repo.ts` merges the tool-set fields (`schemaVersion`,
 * `analyzedAt`, `repository`, `analysisStatus`, `retryCount`) around it and
 * validates the whole against `RepoAnalysisSchema` before persisting.
 *
 * Neither schema uses `.passthrough()` — a chatty model's extra keys are
 * stripped, not rejected.
 */

export const HttpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'ANY',
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpRouteSchema = z.object({
  method: HttpMethodSchema.optional(),
  path: z.string().min(1).regex(/^\//, 'path must start with "/"'),
  filePath: z.string().min(1).optional(),
});
export type HttpRoute = z.infer<typeof HttpRouteSchema>;

export const TopicInterfaceSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(['publish', 'consume', 'unknown']),
  filePath: z.string().min(1).optional(),
});
export type TopicInterface = z.infer<typeof TopicInterfaceSchema>;

export const DatastoreSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['relational', 'document', 'keyvalue', 'blob', 'search', 'other']).optional(),
});
export type Datastore = z.infer<typeof DatastoreSchema>;

export const ServedInterfacesSchema = z.object({
  httpRoutes: z.array(HttpRouteSchema),
  grpcServices: z.array(z.string().min(1)),
  topics: z.array(TopicInterfaceSchema),
  datastores: z.array(DatastoreSchema),
});
export type ServedInterfaces = z.infer<typeof ServedInterfacesSchema>;

export const OutboundVerbSchema = z.enum([
  'calls',
  'depends_on',
  'publishes',
  'subscribes',
  'reads_from',
  'writes_to',
]);
export type OutboundVerb = z.infer<typeof OutboundVerbSchema>;

export const OutboundIntentSchema = z.object({
  target: z.string().min(1),
  verb: OutboundVerbSchema,
  detail: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});
export type OutboundIntent = z.infer<typeof OutboundIntentSchema>;

export const RepositoryRefSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
});
export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;

/** The fields the bounded model call is asked to return. */
export const ModelAnalysisSchema = z.object({
  description: z.string(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  served: ServedInterfacesSchema,
  outbound: z.array(OutboundIntentSchema),
});
export type ModelAnalysis = z.infer<typeof ModelAnalysisSchema>;

/** The complete persisted per-repository analysis artifact. */
export const RepoAnalysisSchema = ModelAnalysisSchema.extend({
  schemaVersion: z.literal('1.0'),
  analyzedAt: z.string(),
  repository: RepositoryRefSchema,
  analysisStatus: z.enum(['complete', 'partial']),
  retryCount: z.union([z.literal(0), z.literal(1)]),
});
export type RepoAnalysis = z.infer<typeof RepoAnalysisSchema>;
