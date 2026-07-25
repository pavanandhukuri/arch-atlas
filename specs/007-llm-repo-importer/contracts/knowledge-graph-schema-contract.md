# Contract: Repository Knowledge Graph File Schema

Per-repository output files written to `{output.directory}/{repo-name}.knowledge-graph.json` — successor to the prior revision's `{repo-name}.metadata.json` contract. Structure per `data-model.md`'s `RepositoryKnowledgeGraph`/`GraphNode`/`GraphEdge` entities (research.md D10 — a trimmed subset of Understand-Anything's schema).

## Example

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "2026-07-25T10:30:00Z",
  "repository": {
    "name": "User Service",
    "path": "/home/user/repos/user-service",
    "description": "Handles authentication and user profile management"
  },
  "analysisStatus": "complete",
  "retryCount": 0,
  "nodes": [
    {
      "id": "file:src/db/client.ts",
      "type": "file",
      "name": "client.ts",
      "filePath": "src/db/client.ts",
      "summary": "Opens a PostgreSQL connection pool from DATABASE_URL"
    },
    {
      "id": "config:docker-compose.yml",
      "type": "config",
      "name": "docker-compose.yml",
      "filePath": "docker-compose.yml",
      "summary": "Declares postgres and notification-service as dependent services"
    },
    {
      "id": "service:user-service",
      "type": "service",
      "name": "user-service",
      "summary": "The analyzed repository itself"
    }
  ],
  "edges": [
    {
      "source": "file:src/db/client.ts",
      "target": "service:user-service",
      "type": "reads_from",
      "weight": 0.9,
      "description": "PostgreSQL connection pool, credentials from DATABASE_URL"
    },
    {
      "source": "config:docker-compose.yml",
      "target": "service:user-service",
      "type": "depends_on",
      "weight": 0.95,
      "description": "docker-compose depends_on: notification-service"
    }
  ]
}
```

## Node type reference (research.md D10 — trimmed from Understand-Anything's 13 to these 12; design/knowledge-base types dropped entirely since this importer never analyzes Figma files or knowledge bases)

| `type`     | Typically produced from                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `file`     | Any source file the agent read                                                          |
| `function` | A function/method the agent identified as relevant to a connection                      |
| `class`    | A class/interface/type relevant to a connection                                         |
| `module`   | A logical package/module grouping                                                       |
| `config`   | docker-compose, k8s manifests, `.env`-adjacent (non-secret) config, package manifests   |
| `document` | README and other documentation the agent used for context                               |
| `service`  | Deployable unit — usually one per repository, plus any Dockerfile/K8s-declared services |
| `table`    | Database table/migration references                                                     |
| `endpoint` | API route/endpoint definitions                                                          |
| `pipeline` | CI/CD configuration                                                                     |
| `schema`   | GraphQL/Protobuf/similar schema definitions                                             |
| `resource` | Infrastructure-as-code resource declarations (Terraform, CloudFormation)                |

## Edge type reference (research.md D10 — trimmed from Understand-Anything's ~38)

| `type`       | Typically means                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `imports`    | Code-level import/require                                                                                     |
| `calls`      | A function call, or (when source/target cross a `service` boundary) an outbound network call — see note below |
| `publishes`  | Message queue / event producer                                                                                |
| `subscribes` | Message queue / event consumer                                                                                |
| `reads_from` | Reads data from a database/table/external store                                                               |
| `writes_to`  | Writes data to a database/table/external store                                                                |
| `depends_on` | Generic declared dependency (manifest `depends_on`, import of a config value, etc.)                           |
| `serves`     | Exposes an endpoint or listens on a port                                                                      |
| `routes`     | Routes a request to a handler                                                                                 |
| `configures` | Config file/value shaping another node's behavior                                                             |
| `deploys`    | CI/CD or infra declaration deploying a service                                                                |
| `provisions` | Infra-as-code resource creation                                                                               |
| `triggers`   | Event/webhook/cron triggering another node                                                                    |

**Note on `calls` and cross-service inference**: unlike the retired static pipeline's `ConnectionType` enum (which distinguished `http`/`grpc`/`database`/`message-queue` at the point of extraction), the agent-driven analysis stage does not itself resolve whether a `calls` edge targets another repository — it only knows what it can see inside one repository. Resolving `calls`/`depends_on`/`configures` edges whose target is _outside_ the current repo into concrete `CrossRepositoryConnection`s is the correlator's job (`contracts/` — see `data-model.md`'s `CrossRepositoryConnection` entity and research.md D7), not something asserted directly in this file.

## `weight` field

A raw agent-asserted relationship-strength signal in `[0, 1]`, **not yet bucketed** into high/medium/low — bucketing happens during review-artifact assembly (research.md D11), after the correlator has had a chance to corroborate or downgrade it. Do not read `weight` directly as a confidence level when consuming this file.

## Validation

Knowledge-graph files are validated against a `zod` schema (`apps/llm-importer/src/graph/schema.ts`) before being written to disk and before being used in correlation. Invalid output (e.g. from a malformed or truncated agent response) triggers the one-retry-then-skip behavior (FR-010a) rather than being written as-is.
