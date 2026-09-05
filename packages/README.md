# Packages

This directory contains independently testable, reusable packages that form the core of the Arch Atlas platform.

## Current Packages

- **core-model**: Semantic architecture model, validation, and diff/patch APIs
- **model-schema**: Canonical JSON schemas for exported model files
- **layout**: Deterministic layout engine and serialization
- **renderer**: PixiJS-based rendering engine for the zoomable architecture map (no React dependency)
- **viewer-components**: React components shared by Studio and the standalone Viewer (`MapCanvas`, `DiagramViewer`, `ZoomControls`, `useZoom`)
- **dsl**: Plain-text DSL for authoring and importing architecture models — parse and serialize `ArchitectureModel`; includes `DSL_FORMAT_DESCRIPTION` for LLM prompt injection. Not currently wired into a Studio UI (see the 004 spec's original in-editor DSL panel, which was dropped) — usable standalone or by other tooling.
- **analysis-runner-local**: Reference producer for `apps/llm-importer` — scans a repository via a local, OpenAI-compatible model endpoint and writes `{repo}.analysis.json` (offline, no hosted API). One of two producers implementing the same contract; the other is the `plugins/repo-analysis` Claude Code plugin.

Each package must have a clear public API exported from its entrypoint and should be usable without the Studio.
