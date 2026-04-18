# arch-atlas Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-29

## Active Technologies

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

- 003-diagram-enhancements: Added TypeScript 5.3.0 + Next.js 14.1.0, React 18.2.0, PixiJS v7 (via `@arch-atlas/renderer`), Vitest 1.0.0, `@testing-library/react`

- 002-flexible-storage: Added TypeScript 5.3.0 + Next.js 14.1.0, React 18.2.0, Vitest 1.0.0 (existing); `@react-oauth/google ^0.13.4`, `@googleworkspace/drive-picker-react ^1.0.1`, `browser-fs-access ^0.35.0`, `idb ^8.0.0` (new)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
