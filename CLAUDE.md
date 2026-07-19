# arch-atlas Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-16

## Active Technologies

- Python 3.11+ + `tree-sitter ^0.21` (multi-language AST parsing), `semgrep ^1.70` (pattern-based integration detection), `networkx ^3.3` (in-memory graph), `pydantic ^2.7` (graph data models), `anthropic ^0.39` (Anthropic SDK), `httpx ^0.27` (Ollama HTTP client), `pyyaml ^6.0`, `jsonschema ^4.23`, `anyio ^4.4`, `click ^8.1`; optional `neo4j ^5.20` (007-llm-repo-importer)
- Graph extraction pipeline: manifests → tree-sitter → semgrep rules → relationship extractor → in-memory/Neo4j graph → cross-repo correlator → LLM enrichment (single call) → arch.json export (007-llm-repo-importer)
- Local filesystem for `.metadata.json` per repo and final `.arch.json`; in-memory graph (default) or Neo4j (optional via config) (007-llm-repo-importer)

- TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target) + Next.js 14.1.0 (App Router), React 18.2.0, `@arch-atlas/renderer` (workspace, PixiJS v7), `@arch-atlas/core-model` (workspace), `@arch-atlas/layout` (workspace) (006-diagram-viewer-zoom)
- Google Drive REST API v3 (existing `GoogleDriveProvider`); local filesystem read-only viewing is out of scope for the shareable URL (006-diagram-viewer-zoom)

- TypeScript 5.3.0 (strict mode, `noUncheckedIndexedAccess`, ES2022 target) + `@arch-atlas/core-model` (workspace dep, types only — no runtime coupling) (004-architecture-dsl)
- N/A — pure in-memory transformation library (004-architecture-dsl)

- TypeScript 5.3.0 + Next.js 14.1.0, React 18.2.0, PixiJS v7 (via `@arch-atlas/renderer`), Vitest 1.0.0, `@testing-library/react` (003-diagram-enhancements)
- Local file system (File System Access API) + Google Drive REST API v3; persisted as `.arch.json` files via `StorageProvider` interface (003-diagram-enhancements)

- TypeScript 5.3.0 + Next.js 14.1.0, React 18.2.0, Vitest 1.0.0 (existing); `@react-oauth/google ^0.13.4`, `@googleworkspace/drive-picker-react ^1.0.1`, `browser-fs-access ^0.35.0`, `idb ^8.0.0` (new) (002-flexible-storage)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.3.0: Follow standard conventions

## Recent Changes

- 007-llm-repo-importer: Revised approach — graph extraction pipeline (tree-sitter + semgrep + networkx) with single LLM enrichment call; replaced LLM-first analysis with static analysis first; added confidence scoring per connection signal

- 006-diagram-viewer-zoom: Added TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target) + Next.js 14.1.0 (App Router), React 18.2.0, `@arch-atlas/renderer` (workspace, PixiJS v7), `@arch-atlas/core-model` (workspace), `@arch-atlas/layout` (workspace)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
