# Data Model: Architecture DSL Module

**Feature**: `004-architecture-dsl` | **Date**: 2026-04-19

---

## Entities

All entities below are internal to `@arch-atlas/dsl` except where marked **public**. The only external dependency is `ArchitectureModel` and its subtypes from `@arch-atlas/core-model`.

---

### Token _(internal)_

Produced by the Lexer. Represents the smallest meaningful unit of text.

| Field   | Type        | Notes                         |
| ------- | ----------- | ----------------------------- |
| `kind`  | `TokenKind` | See enum below                |
| `value` | `string`    | Raw text slice                |
| `line`  | `number`    | 1-based line number in source |
| `col`   | `number`    | 1-based column number         |

**TokenKind enum**:

```
STRING       — quoted string literal (value excludes quotes)
IDENT        — unquoted identifier (element kind keywords, attr keys)
ARROW        — literal "->"
LBRACE       — "{"
RBRACE       — "}"
LBRACKET     — "["
RBRACKET     — "]"
EQUALS       — "="
COMMA        — ","
EOF          — end of input
```

---

### DslAst _(internal)_

Root AST node produced by the Parser (pass 1). Names are unresolved; ids not yet assigned.

| Field           | Type                    | Notes                                         |
| --------------- | ----------------------- | --------------------------------------------- |
| `version`       | `string \| undefined`   | Version string from `version "X"` declaration |
| `elements`      | `DslElementNode[]`      | Top-level element declarations (non-nested)   |
| `relationships` | `DslRelationshipNode[]` | All relationship declarations (flat list)     |

---

### DslElementNode _(internal)_

Represents a single element declaration in the AST (before id resolution).

| Field      | Type                     | Notes                                         |
| ---------- | ------------------------ | --------------------------------------------- |
| `kind`     | `ElementKind`            | One of the 6 supported kinds                  |
| `name`     | `string`                 | Raw name string from DSL                      |
| `attrs`    | `Record<string, string>` | Inline `[key=value]` pairs                    |
| `children` | `DslElementNode[]`       | Nested element declarations (from block body) |
| `line`     | `number`                 | Source line for error reporting               |

**Supported attrs**: `description`, `technology`, `tags` (comma-separated), `external` (boolean string `"true"`/`"false"`), `subtype`, `bg` (backgroundColor hex), `border` (borderColor hex), `font` (fontColor hex)

---

### DslRelationshipNode _(internal)_

Represents a relationship declaration in the AST.

| Field        | Type                     | Notes                           |
| ------------ | ------------------------ | ------------------------------- |
| `sourceName` | `string`                 | Raw source element name         |
| `targetName` | `string`                 | Raw target element name         |
| `attrs`      | `Record<string, string>` | Inline `[key=value]` pairs      |
| `line`       | `number`                 | Source line for error reporting |

**Supported attrs**: `type`, `label`, `action`, `integration`, `description`, `tags`

---

### ParseError _(public)_

Structured error returned in a `DslParseFailure`.

| Field       | Type                 | Notes                                                     |
| ----------- | -------------------- | --------------------------------------------------------- |
| `errorCode` | `DslErrorCode`       | String literal union — see error catalogue in research.md |
| `message`   | `string`             | Human-readable explanation                                |
| `location`  | `ParseErrorLocation` | Where in the document the problem was found               |

### ParseErrorLocation _(public)_

| Field         | Type                  | Notes                                                      |
| ------------- | --------------------- | ---------------------------------------------------------- |
| `line`        | `number \| undefined` | 1-based line number; undefined if not applicable           |
| `elementName` | `string \| undefined` | Name of the offending element; undefined if not applicable |

---

### ParseResult _(public — discriminated union)_

```typescript
type ParseResult = DslParseSuccess | DslParseFailure;
```

### DslParseSuccess _(public)_

| Field   | Type                | Notes                                    |
| ------- | ------------------- | ---------------------------------------- |
| `ok`    | `true`              | Discriminant                             |
| `model` | `ArchitectureModel` | Fully resolved model ready for rendering |

### DslParseFailure _(public)_

| Field    | Type           | Notes                                              |
| -------- | -------------- | -------------------------------------------------- |
| `ok`     | `false`        | Discriminant                                       |
| `errors` | `ParseError[]` | Non-empty list (at least one error always present) |

---

### DslErrorCode _(public — string literal union)_

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

## Relationships Between Entities

```
DSL text
  └─► Lexer ──────────────► Token[]
                              └─► Parser ──────────────► DslAst
                                                          ├── DslElementNode[]
                                                          └── DslRelationshipNode[]
                                                              └─► Resolver ──► ParseResult
                                                                               ├── DslParseSuccess → ArchitectureModel
                                                                               └── DslParseFailure → ParseError[]

ArchitectureModel
  └─► Serializer ──────────────► DSL text
```

---

## Validation Rules (enforced by Resolver)

| Rule                                              | Error Code                           | Description                                                      |
| ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| No duplicate element names in same scope          | `DUPLICATE_NAME`                     | Names are compared case-sensitively within a parent scope        |
| All relationship source/target names must resolve | `UNRESOLVED_REFERENCE`               | Checked after full name registry is built (forward refs ok)      |
| All parentId references must resolve              | `UNRESOLVED_REFERENCE`               | Same pass                                                        |
| No circular parent-child chains                   | `CIRCULAR_PARENT`                    | DFS cycle detection on parent graph                              |
| Version (if declared) must equal `"1"`            | `UNSUPPORTED_VERSION`                | Only version `"1"` supported in v1                               |
| Document must contain at least one element        | `EMPTY_DOCUMENT`                     | Empty or whitespace-only documents rejected                      |
| `isExternal=true` elements must be `kind=system`  | _(validation from core-model rules)_ | Enforced via `@arch-atlas/core-model` validate() post-resolution |

---

## Id Generation

Deterministic slug derived from name + parent scope:

```
slugify(name) → name.trim().toLowerCase()
                          .replace(/\s+/g, '-')
                          .replace(/[^a-z0-9-]/g, '')

id(element, parentId?) → parentId ? `${parentId}.${slugify(name)}` : slugify(name)
```

The `ArchitectureModel.schemaVersion` produced by the parser is always `"1.0"` (matching existing studio output).
