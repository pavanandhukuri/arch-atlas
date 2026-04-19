# @arch-atlas/dsl

Plain-text DSL for describing C4 architecture models — parse and serialize [`ArchitectureModel`](../core-model).

## Purpose

This package provides:

- A human-readable, LLM-friendly text format for authoring architecture diagrams
- `parse(dsl)` — converts DSL text → `ArchitectureModel`
- `serialize(model)` — converts `ArchitectureModel` → DSL text (round-trip guaranteed)
- `DSL_FORMAT_DESCRIPTION` — a compact format description ready for injection into LLM system prompts

## Design Principles

- **Zero dependencies**: No prod deps beyond `@arch-atlas/core-model` (peer)
- **Never throws**: All errors returned as structured `ParseError` objects
- **Round-trip fidelity**: `parse(serialize(model))` is structurally equivalent to the original
- **LLM-friendly**: Brace-delimited, whitespace-insensitive, case-insensitive keywords

## Installation

```bash
pnpm add @arch-atlas/dsl
```

## DSL Format

```dsl
version "1"

# Declare people and external systems at the top level
person "Customer" [description="End user"]
system "Payment Gateway" [external="true"]

# Declare systems with nested containers
system "Web App" {
  container "Frontend"  [technology="React",      subtype="user-interface"]
  container "Backend"   [technology="Node.js",    subtype="backend-service"]
  container "Database"  [technology="PostgreSQL", subtype="database"]
}

# Relationships (forward references supported)
"Customer"  -> "Web App"         [type="uses",  label="Browses"]
"Frontend"  -> "Backend"         [type="calls", label="REST API"]
"Backend"   -> "Database"        [type="reads/writes"]
"Backend"   -> "Payment Gateway" [type="calls", label="Processes payment"]
```

### Element kinds

`landscape` · `person` · `system` · `container` · `component` · `code`

### Inline attributes `[key="value", ...]`

| Key                         | Applies to   | Description                                                                             |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `description`               | any          | Free-text description                                                                   |
| `technology`                | container    | Technology label                                                                        |
| `subtype`                   | container    | `database` · `storage-bucket` · `static-content` · `user-interface` · `backend-service` |
| `external`                  | system       | `"true"` marks as external organization                                                 |
| `tags`                      | any          | Comma-separated tags                                                                    |
| `bg` / `border` / `font`    | any          | Color overrides (6-digit hex)                                                           |
| `type` / `label` / `action` | relationship | Relationship metadata                                                                   |

## Usage

```typescript
import { parse, serialize, DSL_FORMAT_DESCRIPTION } from '@arch-atlas/dsl';

// Parse DSL text → ArchitectureModel
const result = parse(dslText);
if (result.ok) {
  console.log(result.model.elements);
} else {
  result.errors.forEach((e) =>
    console.error(`[${e.errorCode}] line ${e.location.line}: ${e.message}`)
  );
}

// Serialize ArchitectureModel → DSL text
const dslText = serialize(model);

// LLM integration — inject format description into system prompt
const systemPrompt = `Describe the architecture as arch-atlas DSL:\n\n${DSL_FORMAT_DESCRIPTION}`;
```

## Error codes

| Code                     | Trigger                                           |
| ------------------------ | ------------------------------------------------- |
| `UNEXPECTED_TOKEN`       | Unexpected character or keyword                   |
| `UNTERMINATED_STRING`    | Quoted string not closed                          |
| `UNKNOWN_ELEMENT_KIND`   | Element keyword not in supported set              |
| `DUPLICATE_NAME`         | Two elements share a name in the same scope       |
| `UNRESOLVED_REFERENCE`   | Relationship endpoint names an undeclared element |
| `CIRCULAR_PARENT`        | Parent-child hierarchy contains a cycle           |
| `UNSUPPORTED_VERSION`    | Version header is not `"1"`                       |
| `EMPTY_DOCUMENT`         | Document contains no elements                     |
| `MISSING_REQUIRED_FIELD` | Required field (e.g. element name) absent         |

## Running tests

```bash
pnpm --filter @arch-atlas/dsl test
pnpm --filter @arch-atlas/dsl test -- --coverage
```
