# Quickstart: `@arch-atlas/dsl`

**Feature**: `004-architecture-dsl` | **Date**: 2026-04-19

---

## What is this?

`@arch-atlas/dsl` is a zero-dependency TypeScript library that converts plain-text architecture descriptions into structured `ArchitectureModel` objects (and back). It is the text interface layer that enables both hand-authoring and LLM-generated diagram creation in arch-atlas.

---

## Package Location

```
packages/dsl/
```

This package is part of the arch-atlas pnpm workspace. Install it in another workspace package with:

```json
"dependencies": {
  "@arch-atlas/dsl": "workspace:*"
}
```

---

## DSL Format at a Glance

```dsl
version "1"

# Declare people and external systems at the top level
person "Customer" [description="End user"]
system "Payment Gateway" [external=true]

# Declare systems with nested containers
system "Web App" {
  container "Frontend"  [technology="React",      subtype="user-interface"]
  container "Backend"   [technology="Node.js",    subtype="backend-service"]
  container "Database"  [technology="PostgreSQL", subtype="database"]
}

# Declare relationships after elements (forward refs supported)
"Customer"  -> "Web App"         [type="uses",        label="Browses"]
"Frontend"  -> "Backend"         [type="calls",        label="REST API"]
"Backend"   -> "Database"        [type="reads/writes"]
"Backend"   -> "Payment Gateway" [type="calls",        label="Processes payment"]
```

### Supported element kinds

| Keyword     | Core-model `kind` | Can be nested inside |
| ----------- | ----------------- | -------------------- |
| `landscape` | `landscape`       | —                    |
| `person`    | `person`          | —                    |
| `system`    | `system`          | `landscape`          |
| `container` | `container`       | `system`             |
| `component` | `component`       | `container`          |
| `code`      | `code`            | `component`          |

### Inline attributes `[key=value, ...]`

| Key           | Applies to   | Description                                                                                   |
| ------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `description` | any          | Free-text description                                                                         |
| `technology`  | container    | Technology label, e.g. `"React"`                                                              |
| `subtype`     | container    | `"database"`, `"storage-bucket"`, `"static-content"`, `"user-interface"`, `"backend-service"` |
| `external`    | system       | `"true"` marks the system as external                                                         |
| `tags`        | any          | Comma-separated tags, e.g. `"web,frontend"`                                                   |
| `bg`          | any          | Background color hex, e.g. `"#ff0000"`                                                        |
| `border`      | any          | Border color hex                                                                              |
| `font`        | any          | Font color hex                                                                                |
| `type`        | relationship | Relationship type string                                                                      |
| `label`       | relationship | Deprecated alias for `action`                                                                 |
| `action`      | relationship | What the arrow does, e.g. `"Fetches data"`                                                    |
| `integration` | relationship | Mode of integration, e.g. `"REST API"`                                                        |

---

## Parsing

```typescript
import { parse } from '@arch-atlas/dsl';

const result = parse(dslText);

if (result.ok) {
  // result.model is a fully-typed ArchitectureModel
  console.log(result.model.elements);
} else {
  // result.errors is ParseError[] — always non-empty
  for (const err of result.errors) {
    console.error(`[${err.errorCode}] line ${err.location.line}: ${err.message}`);
  }
}
```

**`parse()` never throws.** All errors are returned in the result.

---

## Serialising

```typescript
import { serialize } from '@arch-atlas/dsl';

const dslText = serialize(architectureModel);
// dslText is a valid DSL string that round-trips back through parse()
```

---

## LLM Integration

Inject `DSL_FORMAT_DESCRIPTION` into your LLM system prompt to guide the model to produce valid DSL:

```typescript
import { DSL_FORMAT_DESCRIPTION, SUPPORTED_DSL_VERSION } from '@arch-atlas/dsl';

const systemPrompt = `
You are an architecture assistant. Describe the system as arch-atlas DSL.

${DSL_FORMAT_DESCRIPTION}
`;
```

---

## Error Codes Quick Reference

| Code                     | Meaning                                           |
| ------------------------ | ------------------------------------------------- |
| `UNEXPECTED_TOKEN`       | Syntax error — unexpected character               |
| `UNTERMINATED_STRING`    | A quoted string was not closed                    |
| `UNKNOWN_ELEMENT_KIND`   | Element keyword not in supported list             |
| `DUPLICATE_NAME`         | Two elements share a name in the same scope       |
| `UNRESOLVED_REFERENCE`   | Relationship endpoint names an undeclared element |
| `CIRCULAR_PARENT`        | Nesting creates a parent-child cycle              |
| `UNSUPPORTED_VERSION`    | Version header is not `"1"`                       |
| `EMPTY_DOCUMENT`         | Document contains no elements                     |
| `MISSING_REQUIRED_FIELD` | Required field (e.g. element name) absent         |

---

## Running Tests

```bash
# From repo root
pnpm --filter @arch-atlas/dsl test

# With coverage
pnpm --filter @arch-atlas/dsl test -- --coverage
```
