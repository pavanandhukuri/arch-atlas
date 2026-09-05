# Apps

This directory contains user-facing applications in the Arch Atlas monorepo.

## Current Apps

- **studio**: Browser-based interactive editor for creating and exploring architecture maps.
- **llm-importer**: Deterministic CLI that turns a multi-repository workspace into a diagram Studio can import — correlates per-repository analysis artifacts (produced by a swappable skill/plugin; see `.claude/skills/repo-analysis` and `packages/analysis-runner-local`) into `architecture.review.yaml` / `architecture.arch.json`. Makes no model call itself.
- **viewer**: Standalone, read-only diagram viewer — static files, no server, no auth. Deployable to any web host (e.g. nginx).

Each app consumes the core packages (`@arch-atlas/*`) as dependencies and should not contain domain logic—only UI and user interaction (studio, viewer) or deterministic correlation logic (llm-importer, which itself contains no UI).
