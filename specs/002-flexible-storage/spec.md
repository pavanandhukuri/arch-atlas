# Feature Specification: Flexible Diagram Storage

**Feature Branch**: `002-flexible-storage`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "As of now, the storage of the architecture diagram created using studio is the localstorage. I want to modify this to let the user choose where to store it. For now, the options is either local computer or google drive. If the user selects local computer, see if we can somehow autosave to local disk that the user chooses. If the user selects google drive, the user should be shown a prompt to authorize themselves to google drive and select a folder where to store. Open option should work the same way. In both cases, autosave and manual save should work as expected. Ask the user to store the location of the data whenever a new window is opened, when new button is clicked, when open is clicked."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose Storage on New Diagram (Priority: P1)

When a user starts a new diagram (new window, or clicks New), they are prompted to choose where the diagram will be stored: their local computer or Google Drive. After choosing and providing a location, the diagram autosaves to that location as they work. The user can also manually save at any time.

**Why this priority**: This is the foundational flow — all subsequent storage behavior depends on the user establishing a storage location at the start of a session.

**Independent Test**: Can be fully tested by opening the app or clicking New, selecting "Local Computer", picking a folder/file name, making diagram changes, and verifying the file appears and updates on disk automatically. Delivers basic persistent storage to the user without localStorage dependency.

**Acceptance Scenarios**:

1. **Given** the app is opened in a new window, **When** the app initializes, **Then** a storage location prompt is shown before any diagram editing is possible.
2. **Given** the storage prompt is shown, **When** the user selects "Local Computer" and picks a folder/filename, **Then** the diagram is saved to that path and autosave writes to that file periodically.
3. **Given** the storage prompt is shown, **When** the user clicks New in the toolbar, **Then** the storage location prompt appears, allowing the user to choose a location for the new diagram.
4. **Given** a diagram is open with an established storage location, **When** the user makes changes, **Then** changes autosave to the chosen location within a few seconds.
5. **Given** a diagram is open with an established storage location, **When** the user manually triggers Save, **Then** the diagram is immediately written to the chosen location.

---

### User Story 2 - Google Drive Storage (Priority: P2)

A user who selects Google Drive as their storage location is guided through authorization, selects a folder in their Drive, and the diagram is saved there. Autosave and manual save both write to Google Drive.

**Why this priority**: Google Drive enables cross-device access and cloud backup, providing significant user value beyond local storage. However, it depends on the core storage-selection flow (P1) being in place.

**Independent Test**: Can be fully tested by selecting "Google Drive" in the storage prompt, completing the authorization flow, selecting a folder, making diagram changes, and verifying the `.arch.json` file appears/updates in the chosen Google Drive folder.

**Acceptance Scenarios**:

1. **Given** the storage prompt is shown, **When** the user selects "Google Drive", **Then** a Google authorization flow is launched in the browser.
2. **Given** the user has authorized Google Drive access, **When** authorization succeeds, **Then** a folder-picker is shown so the user can choose where to store the diagram.
3. **Given** a Google Drive folder is selected, **When** the user edits the diagram, **Then** autosave writes the diagram to the chosen Google Drive folder at regular intervals.
4. **Given** Google Drive is the active storage, **When** the user manually triggers Save, **Then** the diagram is immediately written to Google Drive.
5. **Given** Google Drive authorization fails or is denied, **When** the failure occurs, **Then** the user sees a clear error message and is returned to the storage location prompt to choose again.

---

### User Story 3 - Open an Existing Diagram from Chosen Storage (Priority: P2)

When a user clicks Open, they are prompted to choose from where to open: local computer or Google Drive. The app presents an appropriate file or folder picker, loads the selected diagram, and subsequent saves go back to the same location.

**Why this priority**: Opening a diagram must respect the same storage abstraction as saving — without this, the workflow is incomplete and users cannot resume previous work.

**Independent Test**: Can be fully tested by clicking Open, selecting a storage source (local or Drive), picking an existing `.arch.json` file, and verifying the diagram loads correctly with the storage location bound for future saves.

**Acceptance Scenarios**:

1. **Given** the user clicks Open, **When** the storage prompt appears, **Then** the user can choose "Local Computer" or "Google Drive" as the source.
2. **Given** the user selects "Local Computer" for Open, **When** a file picker opens, **Then** the user can select a compatible diagram file from disk and it loads into the studio.
3. **Given** the user selects "Google Drive" for Open, **When** authorized, **Then** a file picker shows compatible diagram files from Google Drive and loads the selected one.
4. **Given** a diagram is loaded from a storage location, **When** the user makes changes, **Then** autosave and manual saves go back to the same file/location automatically.
5. **Given** the selected file is corrupt or incompatible, **When** the user tries to open it, **Then** an error message is shown and the previous diagram state is preserved.

---

### User Story 4 - Recover from Interrupted Session (Priority: P3)

If the app is closed or crashes before a save completes, the user is able to recover their work from the last autosave when they reopen the app.

**Why this priority**: Data safety under failure conditions is important but secondary to the core storage selection and save flows.

**Independent Test**: Can be tested by simulating an unexpected close after edits and verifying that reopening the app offers to restore the last autosaved state from the chosen storage location.

**Acceptance Scenarios**:

1. **Given** a diagram has been autosaved to local computer, **When** the app is reopened, **Then** the user is offered the option to restore the last autosaved state.
2. **Given** a diagram has been autosaved to Google Drive, **When** the app is reopened, **Then** the user is offered the option to restore the last autosaved state from Drive.
3. **Given** the user declines recovery, **When** they dismiss the prompt, **Then** the storage location prompt appears for a fresh start.

---

### Edge Cases

- What happens when local disk write fails (disk full, permissions denied)?
- What happens when Google Drive becomes unavailable mid-session (network drops, token expires)? → A persistent error banner is shown, autosave is paused, and it resumes automatically when connectivity restores. No fallback to local storage occurs.
- What happens if the user dismisses the storage location prompt without choosing?
- What happens if autosave is in progress when the user triggers a manual save simultaneously?
- How does the system handle very large diagrams with slow Drive uploads — does autosave queue or skip overlapping saves?
- What if the chosen Google Drive folder is deleted by another device between saves?
- What if the diagram file is modified externally while the user is actively editing it? → On save, the system detects the version conflict, warns the user, and presents a choice to keep their local version or the remote version.
- What if the browser does not support native local file system write access?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a storage location prompt when a new window opens, when New is clicked, and when Open is clicked — before any diagram editing is permitted.
- **FR-001a**: The storage prompt MUST pre-select the storage type (Local Computer or Google Drive) that the user last used, so they can confirm quickly; the file/folder location must always be chosen explicitly.
- **FR-002**: Storage location prompt MUST offer exactly two options: "Local Computer" and "Google Drive".
- **FR-003**: When "Local Computer" is selected for a new or save context, the system MUST allow the user to choose a folder and filename for the diagram file.
- **FR-004**: When "Local Computer" is selected, the system MUST autosave the diagram to the chosen file on disk at regular intervals whenever unsaved changes exist.
- **FR-005**: When "Local Computer" is selected for Open, the system MUST present a file picker and load the selected diagram file.
- **FR-006**: When "Google Drive" is selected, the system MUST initiate a Google authorization flow before allowing folder or file selection. If the user has a valid persisted token from a previous session, the authorization step MUST be skipped and the user proceeds directly to folder/file selection.
- **FR-006a**: The system MUST persist the Google OAuth token securely across sessions so users do not need to re-authorize each time they use Google Drive.
- **FR-006b**: The system MUST provide a "Disconnect Google Drive" option that revokes the persisted token and requires re-authorization on next use.
- **FR-007**: After successful Google authorization, the system MUST present a folder picker (for save/new) or file picker (for open) scoped to the user's Google Drive.
- **FR-008**: When "Google Drive" is the active storage, the system MUST autosave the diagram to the selected Drive file at regular intervals whenever unsaved changes exist.
- **FR-008a**: If Google Drive becomes unreachable (network loss, token expiry) during an active session, the system MUST display a persistent error banner indicating autosave is paused and MUST resume autosaving automatically once connectivity is restored — without requiring user action.
- **FR-008b**: When autosave resumes after a connectivity interruption, the system MUST write the most recent unsaved state to Drive as the first resumed save.
- **FR-009**: Manual Save MUST immediately write the current diagram state to the active storage location (local or Google Drive).
- **FR-009a**: Before writing on save, the system MUST detect whether the stored file has been modified since it was last read. If a conflict is detected, the system MUST pause the save, display a conflict resolution prompt, and allow the user to choose: keep their current version (overwrite) or discard their changes and load the remote version.
- **FR-010**: When a diagram is opened from a storage location, subsequent autosaves and manual saves MUST write back to that same location without re-prompting.
- **FR-011**: If Google Drive authorization fails or is denied, the system MUST display a clear error message and return the user to the storage location prompt.
- **FR-012**: If a local disk write fails, the system MUST notify the user with a clear error message indicating the failure reason.
- **FR-013**: The system MUST preserve the most recent successfully autosaved state so it can be offered as a recovery option on next launch.
- **FR-014**: The existing localStorage-based autosave MUST be replaced by the user-chosen storage backend; localStorage MAY be retained only as a temporary session buffer for crash recovery purposes.

### Key Entities

- **StorageLocation**: Represents where a diagram is persisted — type (local/google-drive), path or file reference, and associated credentials/token if applicable. The last-used storage type is persisted across sessions as a user preference.
- **DiagramFile**: The serialized architecture model file, associated with exactly one StorageLocation at any given time.
- **AuthorizationSession**: The Google OAuth session granting the app access to a user's Drive, including token state, expiry, and persisted refresh token. Persists across app sessions until explicitly revoked by the user.
- **AutosaveState**: Tracks the last successfully saved content, timestamp, and storage location — used for session recovery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select a storage location and begin diagramming within 60 seconds of opening the app or clicking New.
- **SC-002**: Autosave writes changes to the chosen storage location within 5 seconds of the last edit, with no user action required.
- **SC-003**: 100% of manual Save actions result in the current diagram state being written to the active storage location, confirmed by a visible success indicator.
- **SC-004**: Users completing the Google Drive authorization flow can select a folder and save their first diagram within 3 minutes of clicking "Google Drive".
- **SC-005**: When a local disk write or Google Drive save fails, users see a descriptive error message within 3 seconds of the failure.
- **SC-006**: Users can recover their last autosaved diagram after an unexpected app close or crash, provided at least one autosave completed before the interruption.
- **SC-007**: Opening an existing diagram from local computer or Google Drive completes within 10 seconds for files up to 5 MB.

## Clarifications

### Session 2026-03-19

- Q: How should the Google OAuth token be stored between sessions? → A: Persisted across sessions — token remembered until user explicitly disconnects (Option B)
- Q: Should the app remember the user's storage choice across sessions? → A: Remember last storage type (Local/Drive) but always ask for file/folder location (Option B)
- Q: What should happen when Google Drive becomes unavailable mid-session? → A: Show persistent error banner, pause autosave, resume automatically when reconnected (Option B)
- Q: How should external file conflicts be handled (same file edited on two devices)? → A: Detect conflict on save, warn user, let them choose which version to keep (Option B)
- Q: Should users be able to dismiss the storage location prompt without selecting a location? → A: No — user must select a storage location to proceed; dismissal is not supported (Option A)

## Assumptions

- The studio runs as a web application in a browser environment; local disk write access relies on browser APIs that support native file system access. If the browser does not support this capability, local storage falls back to a download-on-save model (manual saves trigger a file download; autosave is a best-effort in-memory buffer with periodic download prompts).
- Google Drive integration uses standard OAuth2 authorization; the app requires a registered Google Cloud project and OAuth client credentials configured at the infrastructure level (out of scope for this feature).
- The existing diagram file format and schema version handling remain unchanged.
- Users must have a Google account to use the Google Drive option.
- Only one active storage location is supported per diagram session; switching storage locations mid-session is out of scope.
- The storage location prompt is modal and blocks diagram editing until a location is confirmed; dismissal without selection is not supported in the initial version.
- Autosave interval remains consistent with current behavior (approximately every 2 seconds when changes are present), applied to the new storage backends.
