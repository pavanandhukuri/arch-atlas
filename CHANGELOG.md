# Changelog

All notable user-facing changes SHOULD be documented in this file.

## Unreleased

### Added (003-diagram-enhancements)

- **External system marking** (US1): Systems can be marked as external via the element editor. External systems render in a distinct red/maroon colour, drill-down is blocked, and a confirmation dialog warns before child containers are deleted. Reverting to internal starts with an empty container view.
- **New container diagram shapes** (US2): Five new draggable shapes added to the container-level palette — Database (cylinder), Storage Bucket (trapezoid), Static Content (folder), User Interface (browser chrome), Backend Service (terminal). Each shape carries a `containerSubtype` field and renders with a distinct PixiJS graphic.
- **Element colour formatting** (US3): A right-side properties panel opens when any non-external node is selected. Architects can customise background, border, and font colours from a 16-swatch palette. Changes apply live and persist through save/reload cycles. The panel is hidden for external systems.

### Changed (003-diagram-enhancements)

- `Element` model extended with optional `isExternal`, `containerSubtype`, and `formatting` fields.
- Validation pipeline extended with `validateElementAttributes` rule: enforces kind-guards for `isExternal`/`containerSubtype` and validates hex colour format on `formatting` fields.
- JSON schema updated to include new Element and Relationship fields; pre-existing missing fields (`person` kind, `action`/`integrationMode` on Relationship) also corrected.

---

- Initial project scaffolding
