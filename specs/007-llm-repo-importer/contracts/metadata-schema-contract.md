# Contract: Repository Metadata File Schema

Per-repository output files written to `{output.directory}/{repo-name}.metadata.json`.

## Example

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "2026-05-14T10:30:00Z",
  "repository": {
    "name": "User Service",
    "path": "/home/user/repos/user-service",
    "description": "Handles authentication and user profile management"
  },
  "connections": [
    {
      "type": "database",
      "targetService": "PostgreSQL",
      "targetAddresses": ["${DATABASE_URL}", "localhost:5432"],
      "label": "User profile storage",
      "confidence": "high",
      "evidence": ["src/db/client.ts:12 - new Pool({ connectionString: process.env.DATABASE_URL })"]
    },
    {
      "type": "http",
      "targetService": "Notification Service",
      "targetAddresses": ["${NOTIFICATION_SERVICE_URL}"],
      "label": "Send welcome email on registration",
      "confidence": "medium",
      "evidence": [
        "src/handlers/register.ts:45 - fetch(process.env.NOTIFICATION_SERVICE_URL + '/send')"
      ]
    },
    {
      "type": "message-queue",
      "targetService": "RabbitMQ",
      "targetAddresses": ["${AMQP_URL}"],
      "label": "Publish user-created events",
      "confidence": "high",
      "evidence": ["src/events/publisher.ts:8 - amqp.connect(process.env.AMQP_URL)"]
    }
  ],
  "confidence": "high",
  "filesSampled": 47,
  "filesTotal": 52,
  "notes": "Service uses environment variables for all external addresses. PostgreSQL connection pool found in db/client.ts. RabbitMQ publisher in events/publisher.ts."
}
```

## Connection type reference

| `type`          | Detected by                                                         |
| --------------- | ------------------------------------------------------------------- |
| `http`          | HTTP client usage, `fetch`, `axios`, REST client instantiation      |
| `database`      | Connection strings, ORM client init, pool configuration             |
| `message-queue` | AMQP/Kafka/SQS client instantiation, topic producers                |
| `grpc`          | gRPC stub generation, proto client instantiation                    |
| `file-system`   | Cross-service file path references, shared volume mounts in compose |
| `unknown`       | Detected external endpoint but type cannot be determined            |

## Validation

Metadata files are validated against `repo-metadata.schema.json` (defined in `packages/llm-importer/src/analysis/`) before being written to disk and before being used in aggregation.

Invalid metadata (e.g., from a malformed LLM response) is rejected — the repository is marked as `failed` and the original error is reported.
