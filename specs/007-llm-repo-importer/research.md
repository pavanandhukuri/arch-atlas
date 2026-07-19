# Research: LLM Repository Importer

## 1. LLM Provider Abstraction

**Decision**: `LLMProvider` abstract base class (Python ABC) with two concrete implementations — `AnthropicProvider` (cloud) and `OllamaProvider` (local).

**Rationale**: The `anthropic` Python SDK is the natural fit for Claude. Ollama exposes a simple REST API (`POST /api/generate`) that is easily wrapped with `httpx` — no heavyweight SDK needed.

**Alternatives considered**:

- LangChain/LlamaIndex (heavy dependency, adds complexity, rejected for a focused CLI tool)
- OpenAI-compatible wrapper for Anthropic (Anthropic's API is not fully OpenAI-compatible; native SDK is cleaner)

**Interface shape**:

```typescript
interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  name: string;
}
```

---

## 2. Multi-Agent / Parallel Processing Architecture

**Decision**: Two-phase pipeline using `Promise.all()` for parallel per-repo analysis, with a sequential aggregation step.

**Rationale**:

- "One agent per repo" from the spec maps to a separate LLM call per repository, run in parallel (Node.js event loop handles concurrent HTTP requests naturally)
- "Sub-agents to hand off the code reading part" maps to: the per-repo analysis prompt includes summarized file contents; the LLM acts as the sub-agent extracting connection patterns
- The aggregation "agent" is a second, independent LLM call that receives all per-repo metadata as structured JSON context
- `Promise.allSettled()` (not `Promise.all()`) ensures one failure doesn't abort others

**Claude Code CLI as harness**: The tool is a Node.js CLI package (`packages/llm-importer`) invoked via `npx` or a workspace script. It leverages the Anthropic SDK — not the Claude Code CLI itself — since the Claude Code CLI is an interactive tool. The "harness" role is played by the CLI entry point (`cli.ts`).

**Alternatives considered**:

- Sequential processing (simpler, but violates SC-001 for >2 repos)
- Spawning Claude Code CLI processes per repo (high overhead, interactive tool not designed for piped scripting)

---

## 3. Repository File Reading Strategy

**Decision**: Read files recursively from the local path, applying an exclusion list before building the LLM prompt context.

**Rationale**: LLMs have context window limits (~200k tokens for Claude). A full repo cannot fit. Strategy:

1. Walk directory tree, collect file paths
2. Apply exclusion patterns (`.env`, `*.key`, `*.pem`, `node_modules/`, `dist/`, `.git/`, etc.)
3. Prioritize files likely to contain connection patterns: entry points, service clients, config files, `docker-compose.yml`, `.env.example` (not `.env`)
4. If total content exceeds a configurable token budget, truncate lower-priority files and note truncation in metadata

**Security rule**: `.env` files, `*.pem`, `*.key`, `*secret*`, `*credential*` are ALWAYS excluded, regardless of user config. Users can add additional exclusions but cannot remove the security exclusions.

---

## 4. Metadata Schema Design

**Decision**: JSON schema stored in `packages/llm-importer/src/analysis/repo-metadata.schema.json`, mirroring the pattern in `@arch-atlas/model-schema`.

**Rationale**: Consistent with how `@arch-atlas/model-schema` defines the diagram schema. Runtime validation uses `ajv` (already a transitive dep in the ecosystem; consistent with model-schema validation approach).

**Connection types captured**: `http`, `database`, `message-queue`, `grpc`, `file-system`, `unknown` — covers the common patterns in microservice architectures.

---

## 5. Diagram Aggregation

**Decision**: The aggregation LLM call receives all metadata files serialized as JSON in the prompt. The LLM is instructed to output a valid `ArchitectureModel` JSON conforming to the existing schema in `@arch-atlas/model-schema`.

**Validation**: After the LLM produces the diagram JSON, it is validated against `architecture-model.schema.json` using `ajv` before being written to disk. If validation fails, a fallback "partial diagram" with only the services (no relationships) is written.

**Service name deduplication**: When two repos reference the same external service under different names (e.g., "postgres" vs "PostgreSQL"), the aggregation prompt instructs the LLM to normalize names. A post-processing pass also deduplicates by case-insensitive exact match.

**Output format**: A valid `ArchitectureModel` JSON file with:

- `schemaVersion: "1.0"`
- Each analyzed repository → one `container` element (kind: `container`, containerSubtype: `backend-service`)
- Each unique external service detected → one `system` element (kind: `system`, isExternal: true where appropriate)
- Each connection → one `relationship`
- One default `landscape` view with auto-generated layout

---

## 6. Incremental Re-Import

**Decision**: Metadata files are named `{repo-name}.metadata.json` in the output directory. On startup, the session manager checks for existing metadata files and skips repos that have them unless `--force-refresh` is passed.

**Rationale**: Simple filesystem check; no database or lock files needed.

---

## 7. Security & Privacy for LLM Integration (Constitution Gate)

**Decision**: Implement a mandatory consent mechanism for cloud providers and a hard exclusion list.

**Implementation**:

1. **Hard exclusion list** (non-overridable): `.env`, `*.pem`, `*.key`, `*secret*`, `*credential*`, `*.p12`, `*.pfx`, `node_modules/`, `.git/`
2. **Cloud provider warning**: Before any cloud API call, print a warning listing what will be sent and require interactive confirmation (or `--yes` flag for CI)
3. **Timeouts**: All LLM calls have a 120-second timeout with 2 retries (exponential backoff)
4. **Safe logging**: File contents are never logged; only file paths and metadata are logged
5. **Provider allowlist**: Config schema only accepts `anthropic` and `ollama` as provider types

---

## 8. Project Location in Monorepo & Language Choice

**Decision**: Standalone Python app at `apps/llm-importer/`. Language: **Python 3.11+**.

**Rationale**: The constitution explicitly allows "Python for LLM/tool integrations, kept in clearly separated packages/apps." Python has a richer LLM/agent ecosystem (Anthropic Python SDK, httpx, anyio), is more natural for the Claude Code CLI harness pattern, and integrates cleanly with Ollama. The only coupling to the TypeScript packages is the output format (`.arch.json`) — the `architecture-model.schema.json` from `@arch-atlas/model-schema` is used as a pure JSON schema reference, with no Python import of TypeScript packages.

**Dependencies on other packages**: None at runtime. The `architecture-model.schema.json` is referenced by path from `packages/model-schema/src/` during contract tests.
