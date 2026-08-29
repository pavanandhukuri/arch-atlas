# Contract: Import Config File Schema (v2.0)

Config files may be `.json`, `.yaml`, or `.yml`. **Breaking change from v1.0** (research.md D1/D9; spec Question 2 — immediate full replacement, no back-compat requirement): the `provider` block (which allowed `type: "anthropic"`) is replaced by `localModel`, which only accepts local runtimes. There is no config shape that results in a hosted/cloud API call (FR-017).

## Minimal example (JSON)

```json
{
  "version": "2.0",
  "localModel": {
    "provider": "ollama",
    "endpoint": "http://localhost:11434/v1",
    "modelId": "llama3"
  },
  "output": {
    "directory": "./output"
  },
  "repositories": [
    { "path": "./services/user-service" },
    { "path": "./services/order-service", "name": "Orders API" }
  ]
}
```

## Full example (YAML)

```yaml
version: '2.0'

localModel:
  provider: ollama # or "mlx" | "openai-compatible"
  endpoint: http://localhost:11434/v1
  modelId: llama3
  apiKey: '1234' # optional — omit for keyless servers (Ollama ignores it if set)

output:
  directory: ./output
  diagramFileName: my-architecture.arch.json

analysis:
  maxFilesPerRepo: 150
  excludePatterns:
    - '**/*.test.ts'
    - '**/fixtures/**'
  forceRefresh: false
  maxConcurrency: 2 # shared across repo-level AND internal agent-batch fan-out (FR-016) — NOT the same meaning as v1.0's `concurrency`

repositories:
  - path: /home/user/repos/user-service
    name: User Service
    description: Handles authentication and user profile management

  - path: /home/user/repos/order-service
    name: Order Service

  - path: /home/user/repos/notification-service
    name: Notification Service
    description: Sends emails and push notifications via third-party providers
```

## Validation rules

- `version` must be exactly `"2.0"`
- `localModel.provider` must be `"ollama"`, `"mlx"`, or `"openai-compatible"`
- `localModel.endpoint` is required and checked for reachability at startup, before any repository analysis begins (US4 scenario 2) — an unreachable endpoint fails the run immediately with a clear error. Must be the server's OpenAI-compatible base URL, including the `/v1` path segment (e.g. `http://localhost:11434/v1`, not `http://localhost:11434`)
- `localModel.modelId` is required
- `localModel.apiKey` is optional. Omit it for keyless local servers (Ollama, most vLLM/LM Studio setups). Some local servers enforce a key even for localhost-only access (e.g. oMLX) — set it here if the endpoint check succeeds but requests are rejected with 401
- `output.directory` is required; created if it does not exist
- `repositories` must have at least one entry, and no more than 50
- Each `repositories[].path` must be an accessible local directory at config load time
- `analysis.maxConcurrency` must be between 1 and 8 inclusive (upper bound matches the vendored subagent dispatcher's own hard cap, research.md D3)
- `analysis.maxFilesPerRepo` must be between 10 and 1000 (inclusive) — unchanged from v1.0

## Security hardcoded exclusions (cannot be overridden)

Unchanged from the prior revision, and now additionally enforced at the agent's file-access tool layer (Constitution Check, Principle IV), not only as a post-hoc filter:

```
.env
.env.*
*.key
*.pem
*.p12
*.pfx
*secret*
*credential*
*password*
node_modules/
.git/
dist/
build/
coverage/
__pycache__/
.venv/
```

## Migration from v1.0

There is no automatic migration and no dual-format support — this is an immediate replacement (spec Question 2). A v1.0 config file (with a `provider` block) is rejected with a validation error naming the unsupported field, not silently coerced.
