# Contract: Import Config File Schema

Config files may be `.json`, `.yaml`, or `.yml`.

## Minimal example (JSON)

```json
{
  "version": "1.0",
  "provider": {
    "type": "anthropic"
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
version: '1.0'

provider:
  type: ollama
  model: llama3
  endpoint: http://localhost:11434

output:
  directory: ./output
  diagramFileName: my-architecture.arch.json

analysis:
  maxFilesPerRepo: 150
  excludePatterns:
    - '**/*.test.ts'
    - '**/fixtures/**'
  forceRefresh: false
  concurrency: 3

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

- `version` must be exactly `"1.0"`
- `provider.type` must be `"anthropic"` or `"ollama"`
- `provider.endpoint` is required when `provider.type = "ollama"`
- `output.directory` is required; created if it does not exist
- `repositories` must have at least one entry
- Each `repositories[].path` must be an accessible local directory at config load time
- `analysis.concurrency` must be between 1 and 10 (inclusive)
- `analysis.maxFilesPerRepo` must be between 10 and 1000 (inclusive)

## Security hardcoded exclusions (cannot be overridden)

The following patterns are always excluded from file sampling, regardless of config:

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
```
