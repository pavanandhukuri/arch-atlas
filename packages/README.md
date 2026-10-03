# Packages

This directory contains independently testable, reusable packages that form the core of the Arch Atlas platform.

## Current Packages

- **core-model**: Semantic architecture model, validation, and diff/patch APIs
- **model-schema**: Canonical JSON schemas for exported model files
- **layout**: Deterministic layout engine and serialization
- **renderer**: PixiJS-based rendering engine for the zoomable architecture map (no React dependency)
- **viewer-components**: React components shared by Studio and the standalone Viewer (`MapCanvas`, `DiagramViewer`, `ZoomControls`, `useZoom`)

The `apps/llm-importer` analysis producer lives outside this directory, at
`plugins/repo-analysis` — it's a shipped, installable skill/plugin rather than a workspace
dependency of any app here. See its README for details.

Each package must have a clear public API exported from its entrypoint and should be usable without the Studio.
