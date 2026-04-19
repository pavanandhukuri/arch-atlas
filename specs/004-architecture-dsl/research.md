# Research: Architecture DSL Module

**Feature**: `004-architecture-dsl` | **Date**: 2026-04-19

---

## 1. DSL Syntax Style

**Decision**: Brace-delimited block syntax (not whitespace/indentation-sensitive)

**Rationale**: LLMs reliably produce consistent brace syntax even when whitespace varies. Indentation-sensitive formats (YAML, Python-style) are fragile when AI-generated. Brace syntax is familiar to TypeScript developers on this project, and aligns with Structurizr DSL — the closest prior art for C4-style text formats.

**Alternatives considered**:

- YAML: Well-known but verbose for nested element trees; schema required for validation; LLMs tend to mis-indent
- JSON: Too verbose; not human-friendly for hand-authoring
- Indentation-sensitive custom DSL: Fragile with LLM whitespace normalisation
- Structurizr DSL reuse: Structurizr's model closely matches C4 but its `workspace` → `model` → `views` split doesn't map cleanly to arch-atlas's single flat `ArchitectureModel`; parsing Structurizr requires a separate heavy dependency

**DSL grammar sketch (reference for implementation)**:

```
document      ::= version? element* relationship* EOF
version       ::= "version" STRING
element       ::= kind STRING attrs? block?
kind          ::= "person" | "system" | "container" | "component" | "code" | "landscape"
attrs         ::= "[" attr ("," attr)* "]"
attr          ::= IDENT "=" STRING
block         ::= "{" element* "}"
relationship  ::= STRING "->" STRING attrs? block?
rel-block     ::= "{" rel-attr* "}"
rel-attr      ::= ("type"|"label"|"action"|"integration"|"description") STRING
STRING        ::= '"' [^"]* '"'
IDENT         ::= [a-zA-Z][a-zA-Z0-9_-]*
```

**Example DSL document**:

```dsl
version "1"

person "Customer" [description="End user of the platform"]

system "Web App" {
  container "Frontend" [technology="React", subtype="user-interface"]
  container "Backend"  [technology="Node.js", subtype="backend-service"]
  container "Database" [technology="PostgreSQL", subtype="database"]
}

system "Payment Gateway" [external=true]

"Customer"        -> "Web App"          [type="uses", label="Accesses via browser"]
"Frontend"        -> "Backend"          [type="calls", label="REST API"]
"Backend"         -> "Database"         [type="reads/writes"]
"Backend"         -> "Payment Gateway"  [type="calls", label="Processes payments"]
```

---

## 2. Parser Architecture

**Decision**: Custom two-pass recursive-descent parser (Lexer → Parser → Resolver)

**Rationale**: The grammar is LL(1) and simple enough that a hand-written recursive-descent parser is the fastest path to precise, structured error messages with location info. Parser combinator libraries (Chevrotain, Nearley, Peggy) add dependency weight and compile-time complexity without measurable benefit at this grammar size.

**Alternatives considered**:

- **Chevrotain**: Excellent TS support but ~80KB gzipped and requires learning its own API
- **Nearley + moo**: Powerful but limited TS types; adds two deps
- **Peggy**: Clean PEG grammars but JS-only generated parser; poor TypeScript story
- **Hand-written single-pass**: Combining lex+parse+resolve in one pass makes error recovery and forward-reference resolution harder

**Two-pass approach**:

1. **Pass 1 (Lexer + Parser)**: Tokenise text and build an unresolved AST (`DslAst`). At this stage element references in relationships are still name strings, not ids.
2. **Pass 2 (Resolver)**: Walk the AST, build a name→id registry, assign deterministic ids, check for duplicate names and dangling references, output a final `ArchitectureModel`.

---

## 3. Id Generation Strategy

**Decision**: Deterministic slug derived from element name + parent scope path, separated by `.`

**Rationale**: Authors don't supply ids. The id must be stable across re-parses of the same document (so the studio can diff/apply models without orphaning views). Slugifying name + scope path gives uniqueness within a document while remaining human-readable in debug output.

**Algorithm**:

```
slugify(name) = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
id(element)   = parentId ? `${parentId}.${slugify(name)}` : slugify(name)
```

**Examples**:

- `person "Customer"` → id `customer`
- `system "Web App"` → id `web-app`
- `container "Frontend"` inside `system "Web App"` → id `web-app.frontend`

**Collision handling**: Duplicate names within the same scope produce a `DUPLICATE_NAME` parse error (FR-011). Ids are never suffixed to disambiguate; the author must fix the collision.

---

## 4. Error Code Catalogue

**Decision**: Define a finite set of string error codes at package initialisation

**Rationale**: Structured errors (FR-006, clarification Q2) need stable codes for programmatic handling (e.g., LLM retry logic). A finite enum prevents ad-hoc string proliferation.

| Code                     | Trigger                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `UNEXPECTED_TOKEN`       | Lexer/parser finds an unexpected character or keyword             |
| `UNTERMINATED_STRING`    | A quoted string is not closed before EOL/EOF                      |
| `UNKNOWN_ELEMENT_KIND`   | An element keyword is not one of the 6 supported kinds            |
| `DUPLICATE_NAME`         | Two elements share the same name within the same scope            |
| `UNRESOLVED_REFERENCE`   | A relationship endpoint or parent ref names an undeclared element |
| `CIRCULAR_PARENT`        | A parent-child hierarchy contains a cycle                         |
| `UNSUPPORTED_VERSION`    | The declared version is not supported by this parser              |
| `EMPTY_DOCUMENT`         | Document contains no elements (empty or whitespace only)          |
| `MISSING_REQUIRED_FIELD` | A required field (e.g., element name) is absent                   |

---

## 5. Serializer Strategy

**Decision**: Depth-first tree traversal; relationships emitted after all elements; version header always included

**Rationale**: Predictable ordering aids round-trip testing (exact string equality after normalisation). Nesting elements as blocks keeps the output compact (SC-004: under 80 lines for realistic models). Emitting all relationships after elements avoids interleaved forward references.

**Round-trip guarantee**: The serializer MUST produce a DSL document that, when re-parsed, yields a structurally equivalent `ArchitectureModel`. "Structurally equivalent" means: same element ids, names, kinds, parentIds, attributes, and relationship endpoints. Layout positions are intentionally excluded (not encoded in DSL).

---

## 6. LLM Promptability (SC-005)

**Decision**: Provide a compact format description (≤ 20 lines) that can be injected into an LLM system prompt

**Rationale**: SC-005 targets 90% first-attempt parseability. The main risk is LLMs inventing syntax. A concise, copy-pasteable format description reduces this significantly. The format description will be exported as a string constant `DSL_FORMAT_DESCRIPTION` from the package so the LLM importer feature can reference it directly.

**Alternatives considered**: Providing a JSON schema for the DSL — rejected because JSON schema describes the _output model_, not the _input text format_; LLMs would still not know the text syntax.
