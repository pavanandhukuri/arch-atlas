# Studio

**Arch Atlas Studio** is the browser-based interactive editor for creating and exploring architecture maps.

## Architecture

Studio is a **thin client** that consumes core packages:
- `@arch-atlas/core-model` for model validation and manipulation
- `@arch-atlas/layout` for deterministic layout computation
- `@arch-atlas/renderer` for WebGL-based canvas rendering

**IMPORTANT**: Studio contains **no domain logic**. All semantic rules, validation, and business logic live in the core packages.

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development server
pnpm --filter=arch-atlas-studio dev

# Build for production
pnpm --filter=arch-atlas-studio build

# Run tests
pnpm --filter=arch-atlas-studio test
```

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

For Google Drive storage, you need a Google Cloud project with the **Google Drive API** enabled and an OAuth 2.0 Web client ID (no server secret required — auth uses a popup flow entirely in the browser).

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **UI**: React 18+
- **Styling**: CSS (globals)
- **State Management**: Custom ModelStore (thin wrapper over core-model)
- **Canvas**: PixiJS via `@arch-atlas/renderer`
- **Storage**: File System Access API (local) · Google Drive REST API
- **Auth**: `@react-oauth/google` popup OAuth — no server-side token handling

## File Structure

```
src/
├── app/                    # Next.js app router
│   └── api/                # (empty — auth is client-side)
├── components/             # React components
│   ├── map-canvas/         # Canvas integration
│   ├── model-editor/       # Element/relationship editors
│   └── storage/            # Storage prompt, conflict, status banner
├── hooks/                  # Custom React hooks (useStorageSession, useGoogleDriveAuth)
├── services/               # Browser services
│   ├── storage/            # StorageProvider backends (local, Google Drive) + manager
│   └── import-export.ts    # JSON import/export helpers
└── state/                  # Model state management + storage preference
```

## Storage Backends

| Backend | Mechanism | Persistence |
|---------|-----------|-------------|
| Local Computer | File System Access API (`showSaveFilePicker`) | Persistent — browser holds FileSystemFileHandle in IndexedDB |
| Google Drive | Drive REST API v3 (`appDataFolder`) | Persistent — stored in user's hidden app data folder |

Autosave runs every 2 seconds when dirty, skips ticks if a save is already in-flight.

## Design Guidelines

### No Domain Logic in Studio

Studio should **never** contain:
- Model validation rules (use `@arch-atlas/core-model`)
- Layout algorithms (use `@arch-atlas/layout`)
- Rendering logic (use `@arch-atlas/renderer`)

Studio **should** contain:
- UI components and interaction handlers
- Browser-specific services (file I/O, Google Drive API calls)
- Thin state management (wrapping core-model APIs)

### Code Review Checklist

Before merging Studio code, verify:
- [ ] No validation rules in Studio code
- [ ] No layout computation in Studio code
- [ ] No rendering logic outside renderer package
- [ ] All domain logic delegated to core packages
- [ ] Tests focus on UI behavior, not domain rules

## License

See [LICENSE](../../LICENSE) in the monorepo root.
