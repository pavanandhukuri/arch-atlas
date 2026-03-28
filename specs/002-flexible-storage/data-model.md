# Data Model: Flexible Diagram Storage

**Feature**: 002-flexible-storage
**Date**: 2026-03-19

---

## Entities

### StorageLocation

Represents a fully resolved save/open target for a single diagram session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"local" \| "google-drive"` | Yes | Which storage backend is active |
| `fileHandle` | `FileSystemFileHandle \| null` | When `type === "local"` | Browser File System API handle to the chosen file |
| `driveFileId` | `string \| null` | When `type === "google-drive"` | Google Drive file ID |
| `driveFolderId` | `string \| null` | When `type === "google-drive"` | Parent folder ID in Google Drive |
| `fileName` | `string` | Yes | Filename (e.g., `my-diagram.arch.json`) |
| `lastKnownModified` | `number \| string \| null` | Yes | `lastModified` ms timestamp (local) or ISO `modifiedTime` (Drive); used for conflict detection |

**State transitions**:
- `null` (unset) → `StorageLocation` (user completes storage prompt) → persists until New/Open resets it
- Switching storage mid-session is out of scope; `StorageLocation` is immutable for the lifetime of a diagram session

**Validation rules**:
- If `type === "local"`, `fileHandle` MUST be non-null; Drive fields MUST be null.
- If `type === "google-drive"`, `driveFileId` and `driveFolderId` MUST be non-null; `fileHandle` MUST be null.
- `fileName` MUST end with `.arch.json`.

---

### StoragePreference

User preference data persisted in `localStorage` across sessions. Contains only non-sensitive metadata.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lastUsedType` | `"local" \| "google-drive"` | Yes | Pre-selects the storage type in the next storage prompt |

**Persistence**: `localStorage` under key `arch-atlas-storage-preference`.

**Notes**: No file paths or Drive IDs are stored here — only the storage type. Allows the prompt to pre-select but still require the user to pick the specific file/folder.

---

### FileHandleRecord

An IndexedDB record for persisting `FileSystemFileHandle` objects across page refreshes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `"current-diagram"` (constant) | Yes | Single-record store; always keyed by this constant |
| `handle` | `FileSystemFileHandle` | Yes | The serializable file handle object |
| `fileName` | `string` | Yes | Duplicated for display without re-requesting permission |
| `storedAt` | `number` | Yes | `Date.now()` when stored; for debugging/staleness detection |

**Persistence**: IndexedDB database `arch-atlas-fs`, object store `file-handles`.

**Lifecycle**:
- Written when user selects a local file (New or Open)
- Read on app startup to restore the last local handle
- Cleared when user clicks New or opens a different file

---

### AuthorizationSession

Represents the active Google OAuth session. Access token lives in memory (React Context); refresh token lives in `httpOnly` cookie managed server-side.

| Field | Type | Where stored | Description |
|-------|------|-------------|-------------|
| `accessToken` | `string` | React Context (memory) | Short-lived access token (~1 hour). Lost on page refresh; re-hydrated via `/api/auth/me`. |
| `expiresAt` | `number` | React Context (memory) | Unix ms timestamp when access token expires; drives auto-refresh scheduler. |
| `refreshToken` | `string` | `httpOnly` cookie (server-managed) | Long-lived token used to silently obtain new access tokens. Never accessible to client JavaScript. |

**State transitions**:
- `null` (no session) → `AuthorizationSession` (user completes Google auth) → persists across page refreshes via cookie → `null` (user disconnects or token revoked)

**Security invariants**:
- `refreshToken` MUST never appear in any client-side code path, response body read by JS, or log output.
- `accessToken` MUST be dropped from memory on disconnect; not persisted to any storage.

---

### AutosaveState

Session-level recovery buffer. Holds the most recent successfully written content for crash recovery.

| Field | Type | Where stored | Description |
|-------|------|-------------|-------------|
| `content` | `string` | `localStorage` (temporary) | JSON-serialized `ArchitectureModel` of last successful autosave |
| `timestamp` | `string` | `localStorage` | ISO timestamp of last successful write |
| `storageType` | `"local" \| "google-drive"` | `localStorage` | Which backend successfully persisted this state |
| `fileName` | `string` | `localStorage` | Filename at time of last save, for recovery display |

**Persistence**: `localStorage` under keys `arch-atlas-autosave` and `arch-atlas-autosave-timestamp` (preserving existing keys for backwards compatibility).

**Lifecycle**:
- Written after EVERY successful autosave or manual save to either backend.
- Read on app startup to offer crash recovery.
- Cleared when user explicitly clicks New or successfully opens a different file.

**Notes**: This is a recovery buffer only. It is NOT the primary storage — the authoritative copy lives on local disk or Google Drive.

---

## Entity Relationships

```
StoragePreference (localStorage)
    └── informs initial selection in → StoragePromptDialog

StorageLocation (in-memory, session-scoped)
    ├── type = "local"  → owns → FileHandleRecord (IndexedDB)
    └── type = "google-drive" → uses → AuthorizationSession (memory + httpOnly cookie)

StorageLocation
    └── is the write target for → DiagramFile (ArchitectureModel)

AutosaveState (localStorage, recovery buffer)
    └── mirrors last written → DiagramFile content
```

---

## State Machines

### Diagram Session State

```
[APP_OPEN / NEW_CLICKED / OPEN_CLICKED]
         │
         ▼
[AWAITING_STORAGE_LOCATION] ←── (modal, cannot dismiss)
         │
    user selects type + file/folder
         │
         ▼
[SESSION_ACTIVE]
    ├── on edit → DIRTY → autosave timer fires → write to StorageLocation → CLEAN
    ├── on manual save → write immediately to StorageLocation
    ├── on Drive offline → AUTOSAVE_PAUSED (banner shown) → auto-resume on reconnect
    ├── on write conflict detected → CONFLICT_RESOLUTION (modal) → user chooses → SESSION_ACTIVE
    └── on NEW / OPEN → back to [AWAITING_STORAGE_LOCATION]
```

### Google Auth State

```
[UNAUTHENTICATED]
    │ user selects "Google Drive"
    ▼
[CHECKING_PERSISTED_TOKEN] → valid refresh cookie → [AUTHENTICATED]
    │ no valid token
    ▼
[AWAITING_GOOGLE_AUTH] → user completes OAuth popup
    │ success
    ▼
[AUTHENTICATED]
    ├── access token expires → silent refresh via /api/auth/refresh → [AUTHENTICATED]
    ├── refresh token invalid → [UNAUTHENTICATED] (user must re-auth)
    └── user clicks "Disconnect" → revoke + clear → [UNAUTHENTICATED]
```

---

## Existing Entities (Unchanged)

- **`ArchitectureModel`** — the core diagram data model from `@arch-atlas/core-model`. Schema version, file format, and validation logic are unchanged.
- **`ModelStore`** — state management class in `apps/studio/src/state/model-store.ts`. Unchanged; still owns `isDirty` flag.
- **`ValidationError`** — from `@arch-atlas/core-model`. Unchanged.
