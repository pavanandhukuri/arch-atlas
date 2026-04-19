# Public API Contract: `@arch-atlas/dsl`

**Feature**: `004-architecture-dsl` | **Date**: 2026-04-19

This document defines the complete public surface of the `@arch-atlas/dsl` package. Everything not listed here is an internal implementation detail and MUST NOT be imported by consumers.

---

## Exported Functions

### `parse(dsl: string): ParseResult`

Parses a DSL text document into an `ArchitectureModel`.

**Input**: A plain-text DSL string. May be empty or whitespace-only (returns `DslParseFailure` with `EMPTY_DOCUMENT`).

**Output**: A `ParseResult` discriminated union:

- On success: `{ ok: true, model: ArchitectureModel }`
- On failure: `{ ok: false, errors: ParseError[] }` — at least one error always present; partial models are never returned

**Behaviour guarantees**:

- Never throws; all errors are returned in the `ParseResult`
- Whitespace-insensitive (extra spaces, tabs, blank lines are ignored)
- Case-insensitive for element kind keywords (`System` = `system`)
- Forward references in relationships are resolved after all elements are collected
- Duplicate element names in the same scope → `DUPLICATE_NAME` error
- Unresolved references → `UNRESOLVED_REFERENCE` error
- Optional `version` header: if present and not `"1"`, returns `UNSUPPORTED_VERSION`; if absent, assumes `"1"`

---

### `serialize(model: ArchitectureModel): string`

Serialises an `ArchitectureModel` to a DSL text document.

**Input**: Any `ArchitectureModel` (as produced by the studio or by `parse()`).

**Output**: A UTF-8 DSL string that, when passed to `parse()`, produces a structurally equivalent model.

**Behaviour guarantees**:

- Always includes `version "1"` header
- Elements are emitted depth-first; children are nested inside parent blocks
- Top-level elements (no parent) are emitted first, then orphan relationships (no parent context)
- All relationships are emitted after the element tree
- Output uses 2-space indentation
- Round-trip guarantee: `parse(serialize(model)).model` is structurally equivalent to `model` for all valid models

---

## Exported Types

### `ParseResult`

```typescript
type ParseResult = DslParseSuccess | DslParseFailure;
```

### `DslParseSuccess`

```typescript
interface DslParseSuccess {
  ok: true;
  model: ArchitectureModel; // from @arch-atlas/core-model
}
```

### `DslParseFailure`

```typescript
interface DslParseFailure {
  ok: false;
  errors: ParseError[]; // non-empty
}
```

### `ParseError`

```typescript
interface ParseError {
  errorCode: DslErrorCode;
  message: string;
  location: ParseErrorLocation;
}
```

### `ParseErrorLocation`

```typescript
interface ParseErrorLocation {
  line?: number; // 1-based; present for lexer/parser errors
  elementName?: string; // present for resolver errors (DUPLICATE_NAME, UNRESOLVED_REFERENCE)
}
```

### `DslErrorCode`

```typescript
type DslErrorCode =
  | 'UNEXPECTED_TOKEN'
  | 'UNTERMINATED_STRING'
  | 'UNKNOWN_ELEMENT_KIND'
  | 'DUPLICATE_NAME'
  | 'UNRESOLVED_REFERENCE'
  | 'CIRCULAR_PARENT'
  | 'UNSUPPORTED_VERSION'
  | 'EMPTY_DOCUMENT'
  | 'MISSING_REQUIRED_FIELD';
```

---

## Exported Constants

### `DSL_FORMAT_DESCRIPTION: string`

A ≤ 20-line plain-text description of the DSL format, intended for injection into LLM system prompts. Describes element kinds, inline attribute syntax, relationship syntax, and the optional version header. No external doc link required — the constant is self-contained.

### `SUPPORTED_DSL_VERSION: string`

The string `"1"` — the only version accepted by this release. Exported so consumers can stamp documents they generate.

---

## Peer Dependencies

| Package                  | Version       | Notes                           |
| ------------------------ | ------------- | ------------------------------- |
| `@arch-atlas/core-model` | workspace `*` | Types only; no runtime coupling |

## Zero Runtime Dependencies

The package MUST have zero `dependencies` entries in `package.json`. `@arch-atlas/core-model` is a `peerDependency`. All dev tooling is in `devDependencies`.

---

## Usage Example

```typescript
import { parse, serialize, type ParseResult } from '@arch-atlas/dsl';

const dsl = `
version "1"
person "Customer"
system "Web App" {
  container "Frontend" [technology="React"]
}
"Customer" -> "Web App" [type="uses"]
`;

const result: ParseResult = parse(dsl);

if (result.ok) {
  console.log(result.model.elements.length); // 3
  const roundTripped = serialize(result.model);
  const again = parse(roundTripped);
  console.log(again.ok); // true
} else {
  result.errors.forEach((e) =>
    console.error(`[${e.errorCode}] line ${e.location.line}: ${e.message}`)
  );
}
```
