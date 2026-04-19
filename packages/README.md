# Packages

This directory contains independently testable, reusable packages that form the core of the Arch Atlas platform.

## Current Packages

- **core-model**: Semantic architecture model, validation, and diff/patch APIs
- **model-schema**: Canonical JSON schemas for exported model files
- **layout**: Deterministic layout engine and serialization
- **renderer**: PixiJS-based rendering engine for the zoomable architecture map
- **dsl**: Plain-text DSL for authoring and importing architecture models — parse and serialize `ArchitectureModel`; includes `DSL_FORMAT_DESCRIPTION` for LLM prompt injection

Each package must have a clear public API exported from its entrypoint and should be usable without the Studio.
