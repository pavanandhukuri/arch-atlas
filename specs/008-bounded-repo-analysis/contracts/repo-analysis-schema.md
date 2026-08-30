# Contract: `RepoAnalysis` artifact & model-output schema

**Applies to**: `src/analysis/repo-analysis.schema.ts` (zod), the persisted file
`{output.directory}/{repo-name}.analysis.json`, and the JSON the bounded model call
must return after prose is stripped.

## Zod schema (authoritative)

```ts
const HttpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY']);

const HttpRouteSchema = z.object({
  method: HttpMethod.optional(),
  path: z.string().min(1).regex(/^\//, 'path must start with "/"'),
  filePath: z.string().min(1).optional(),
});

const TopicInterfaceSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(['publish', 'consume', 'unknown']),
  filePath: z.string().min(1).optional(),
});

const DatastoreSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['relational', 'document', 'keyvalue', 'blob', 'search', 'other']).optional(),
});

const ServedInterfacesSchema = z.object({
  httpRoutes: z.array(HttpRouteSchema),
  grpcServices: z.array(z.string().min(1)),
  topics: z.array(TopicInterfaceSchema),
  datastores: z.array(DatastoreSchema),
});

const OutboundIntentSchema = z.object({
  target: z.string().min(1),
  verb: z.enum(['calls', 'depends_on', 'publishes', 'subscribes', 'reads_from', 'writes_to']),
  detail: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

const RepositoryRefSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
});

export const RepoAnalysisSchema = z.object({
  schemaVersion: z.literal('1.0'),
  analyzedAt: z.string(),
  repository: RepositoryRefSchema,
  description: z.string(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  served: ServedInterfacesSchema,
  outbound: z.array(OutboundIntentSchema),
  analysisStatus: z.enum(['complete', 'partial']),
  retryCount: z.union([z.literal(0), z.literal(1)]),
});
export type RepoAnalysis = z.infer<typeof RepoAnalysisSchema>;
```

- Schema is **not** `.passthrough()` — extra keys from a chatty model are stripped,
  not rejected.
- `schemaVersion`, `analyzedAt`, `repository`, `analysisStatus`, `retryCount` are set
  by `analyze-repo.ts` after the call, not requested from the model. The model is asked
  only for `description`, `languages`, `frameworks`, `served`, `outbound`.

## Model-facing sub-shape (what the prompt asks for)

```jsonc
{
  "description": "string — 1-3 sentences",
  "languages": ["string", ...],
  "frameworks": ["string", ...],
  "served": {
    "httpRoutes": [{ "method": "POST", "path": "/v1/send", "filePath": "src/http.ts" }],
    "grpcServices": ["notifications.v1.NotificationService"],
    "topics": [{ "name": "notifications.outbound", "direction": "consume", "filePath": "src/consumer.ts" }],
    "datastores": [{ "name": "notifications", "kind": "relational" }]
  },
  "outbound": [
    { "target": "user-service", "verb": "calls", "detail": "fetches recipient profile before sending", "confidence": 0.6 }
  ]
}
```

Empty arrays are valid and expected for repos with no interface of a given kind
(spec US1 scenario 4). `description` may be `""` if the model returns nothing usable,
but the key must be present.

## Full persisted example (`notification-service.analysis.json`)

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "2026-08-30T12:00:00.000Z",
  "repository": {
    "name": "notification-service",
    "path": "/abs/workspace/notification-service",
    "description": "Sends user-facing notifications"
  },
  "description": "A TypeScript service that consumes notification events from a queue and delivers them over HTTP and email.",
  "languages": ["TypeScript"],
  "frameworks": ["Express", "KafkaJS"],
  "served": {
    "httpRoutes": [{ "method": "POST", "path": "/v1/send", "filePath": "src/server.ts" }],
    "grpcServices": [],
    "topics": [
      { "name": "notifications.outbound", "direction": "consume", "filePath": "src/consumer.ts" }
    ],
    "datastores": []
  },
  "outbound": [
    {
      "target": "user-service",
      "verb": "calls",
      "detail": "resolves recipient contact info via GET /v1/users/:id",
      "confidence": 0.6
    }
  ],
  "analysisStatus": "complete",
  "retryCount": 0
}
```

## Partial salvage (research.md D13.5)

Strict `ModelAnalysisSchema.parse` is tried first. If it fails but the response still
carries a usable `description` **or** a non-empty `languages`/`frameworks` list,
`analyze-repo.ts`'s `coerceModelAnalysis` accepts it via `SalvageModelAnalysisSchema`
(each field falls back to a safe default — `served` → all-empty, `outbound` → `[]`) and
marks the artifact `analysisStatus: "partial"`. A parsed object with no usable signal
still throws (→ the one retry, then a reported failure). The correlator reads repository
source directly for interfaces, so a `partial` artifact still contributes.

## Contract tests

1. The full persisted example validates against `RepoAnalysisSchema`.
2. A response missing `served` but with a non-empty `description` is **salvaged** as
   `analysisStatus: "partial"` with `served` emptied — it does **not** fail the repo.
3. A response with `served.httpRoutes: [{ "path": "v1/send" }]` (no leading `/`) fails
   strict validation; salvage empties `served` and keeps the good fields as `partial`.
4. A parsed object with no `description` and no `languages`/`frameworks` is rejected
   (→ the one retry).
5. A response wrapped in ` ```json ... ``` ` fences and surrounding prose is
   extracted and validates (parser tolerance); trailing commas, `//`/block comments,
   and a truncated (unclosed) object are also recovered (research.md D13.3).
6. Extra top-level key `"notes": "..."` in the response is stripped; the rest validates.
