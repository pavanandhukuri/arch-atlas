# Research: Flexible Diagram Storage

**Feature**: 002-flexible-storage
**Date**: 2026-03-19
**Status**: Complete — all unknowns resolved

---

## Decision 1: Local Disk Storage API

**Decision**: Use the browser **File System Access API** (`showOpenFilePicker`, `showSaveFilePicker`, `FileSystemFileHandle.createWritable`)

**Rationale**:
- Native browser API that gives genuine local-disk read/write without download dialogs once the user has granted permission.
- Handles the full lifecycle: open, overwrite, permission persistence across refreshes (Chrome 122+ "persistent permissions").
- Full support in Chrome 86+ and Edge 86+, which are the primary targets for web-based diagramming tools.

**Fallback** (Firefox, Safari, or older browsers): Use [`browser-fs-access`](https://github.com/GoogleChromeLabs/browser-fs-access) — Google's official ponyfill that detects support and falls back to the download/`<input type="file">` model transparently.

**Autosave pattern**:
- For each save cycle: `fileHandle.createWritable()` → `writable.write(content)` → `writable.truncate(content.length)` → `writable.close()`. Full overwrite every cycle — safer and simpler than seek+truncate.
- Interval: 2 seconds (unchanged from current behavior).

**FileHandle persistence across page refreshes**:
- Serialize `FileSystemFileHandle` into IndexedDB after initial user selection.
- On page load, retrieve from IndexedDB and call `fileHandle.queryPermission()`. If `"granted"`, proceed. If `"prompt"`, call `fileHandle.requestPermission()` — Chrome 122+ shows a three-way prompt that can persist permission indefinitely.
- Store the handle under a known key scoped to the diagram session.

**Conflict detection (local)**:
- Track `lastModified` timestamp from `fileHandle.getFile().lastModified` at the time of each successful read.
- Before each write, fetch current `lastModified`. If it exceeds the stored value, a conflict is detected → show conflict resolution dialog.
- Poll interval for passive conflict detection: every 5 seconds during an active session (lightweight).

**Alternatives considered**:
- Download-only (no File System Access API): Simple but requires user action on every save — unacceptable for autosave.
- `showDirectoryPicker` + manage filenames internally: More complex; unnecessary for single-file diagram sessions.

---

## Decision 2: Google Drive Integration Library

**Decision**: `@react-oauth/google` for authorization + `@googleworkspace/drive-picker-react` for file/folder picking + raw `fetch` calls to Drive API v3 REST endpoints.

**Rationale**:
- `@react-oauth/google` is the current maintained React wrapper for Google Identity Services (GIS); the older `gapi` library is deprecated.
- `@googleworkspace/drive-picker-react` is the official Google Workspace React component for the Google Picker — handles file/folder selection without custom UI.
- Direct `fetch` to Drive v3 REST API avoids the bloated `googleapis` npm package (Node.js-targeted, not browser-optimized).

**OAuth flow**: Authorization Code Flow + PKCE (implicit flow is deprecated as of 2019).

**Scope**: `https://www.googleapis.com/auth/drive.file` only — least-privilege; limits token blast radius to files the app explicitly created or the user selected.

**Drive API v3 operations used**:
- `POST /upload/drive/v3/files?uploadType=multipart` — create new file in folder
- `PATCH /upload/drive/v3/files/{fileId}?uploadType=multipart` — overwrite existing file
- `GET /drive/v3/files?q=...&fields=files(id,name,modifiedTime)` — list `.arch.json` files in a folder
- `GET /drive/v3/files/{fileId}?fields=modifiedTime` — fetch metadata for conflict detection
- Google Picker API (via `@googleworkspace/drive-picker-react`) — folder + file UI

**Conflict detection (Drive)**:
- Record `modifiedTime` from Drive metadata on each successful read or write.
- Before each write, fetch current `modifiedTime` via a lightweight metadata-only GET. If it is newer than stored value, conflict detected → show conflict resolution dialog.
- Race window is small (metadata fetch is fast) and acceptable for this use case.

**Rate limits**: Drive API v3 allows 3 writes per second sustained. At 2-second autosave intervals this is safe (0.5 writes/sec). Implement exponential backoff (1s → 2s → 4s) on `429` or `403` responses.

**Alternatives considered**:
- `firebase/storage`: Full Firebase SDK; too heavyweight and requires Firebase project setup.
- `@googleapis/drive`: Node.js-only; not suitable for browsers.
- Manual OAuth2 PKCE without a library: Feasible but error-prone; GIS library is maintained by Google.

---

## Decision 3: OAuth Token Security Model

**Decision**: **Backend-for-Frontend (BFF) pattern using Next.js API routes** — access token in React Context (memory), refresh token in `httpOnly` + `Secure` + `SameSite=Strict` cookie.

**Rationale**:
- Storing refresh tokens in `localStorage` or `IndexedDB` is vulnerable to XSS exfiltration — a single XSS exploit grants permanent Drive access.
- `httpOnly` cookies are inaccessible to JavaScript, eliminating the XSS token-theft vector.
- Next.js 14 provides built-in API routes (`app/api/`) — no separate backend server needed. The BFF proxy is just 5 small route handlers inside the same Next.js app.
- Access tokens are kept in memory (React Context) and re-hydrated from the refresh token on page load via `/api/auth/me`.
- Refresh token rotation: every use of the refresh token issues a new one (old one invalidated), limiting replay window.

**Token lifecycle**:
1. User initiates Google auth → `/api/auth/google` generates PKCE challenge, redirects to Google.
2. Google callback → `/api/auth/callback` exchanges code + verifier for tokens. Access token returned to client as JSON; refresh token stored in `httpOnly` cookie.
3. Client stores access token in React Context, schedules auto-refresh at 55 minutes.
4. On page refresh → client calls `/api/auth/me`, which reads the `httpOnly` cookie, silently refreshes, and returns a fresh access token. User stays connected.
5. "Disconnect" → `/api/auth/revoke` calls Google's revoke endpoint server-side, clears the cookie.

**Scope blast radius**: `drive.file` scope limits a compromised token to only the files the app created/the user selected — not the entire Google Drive.

**CSP**: Add nonce-based Content Security Policy in `next.config.js` to reduce XSS risk that would enable session hijacking even without token theft.

**Alternatives considered**:
- `sessionStorage`: Lost on tab close; still XSS-readable; poor UX.
- Memory-only (no persistence): Forces re-auth on every page load; fails FR-006a.
- `localStorage` refresh token: Unacceptable per OWASP and Google's own guidance.

---

## Decision 4: New npm Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `@react-oauth/google` | `^0.13.4` | Google Identity Services React wrapper for OAuth2 + PKCE |
| `@googleworkspace/drive-picker-react` | `^1.0.1` | Official Google file/folder picker React component |
| `@googleworkspace/drive-picker-element` | `^1.0.0` | Web component dependency (peer dep of above) |
| `browser-fs-access` | `^0.35.0` | File System Access API ponyfill + fallback for unsupported browsers |
| `idb` | `^8.0.0` | Lightweight IndexedDB wrapper for FileHandle + preference persistence |

All packages are actively maintained, browser-compatible, and scoped to the minimum required surface area (Constitution §V).

---

## Decision 5: Storage Preference Persistence

**Decision**: Persist last-used storage type (Local/Drive) in `localStorage` under a dedicated key (`arch-atlas-storage-preference`). This is user-preference data (not sensitive), so `localStorage` is appropriate.

**Rationale**: The clarified spec (FR-001a) requires the storage prompt to pre-select the last-used type. Storage-type preference is non-sensitive metadata — no token, path, or file reference is stored here. This is the same risk profile as theme or language preferences.

**IndexedDB** is used for `FileSystemFileHandle` objects (which are not serializable to `localStorage`) and for `AutosaveState` recovery buffers.

---

## Resolution Summary

| Unknown | Resolved? | Decision |
|---------|-----------|----------|
| Local disk write API | ✅ | File System Access API + `browser-fs-access` fallback |
| FileHandle persistence across refreshes | ✅ | IndexedDB + `requestPermission()` on restore |
| Autosave write pattern | ✅ | Full-overwrite via `createWritable` every 2 seconds |
| Google Drive auth library | ✅ | `@react-oauth/google` + PKCE + BFF proxy |
| Google Drive file operations | ✅ | Raw fetch to Drive v3 REST |
| OAuth token security | ✅ | httpOnly cookie for refresh token + memory for access token |
| Token persistence UX | ✅ | BFF `/api/auth/me` rehydration on page load |
| Conflict detection (local) | ✅ | `lastModified` timestamp comparison before write |
| Conflict detection (Drive) | ✅ | `modifiedTime` metadata fetch before write |
| Storage preference persistence | ✅ | `localStorage` for type preference, IndexedDB for FileHandle |
