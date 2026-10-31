# Artifact Contract: `{repo}.components.json`

## Worked example

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "2026-10-03T12:00:00.000Z",
  "repository": {
    "name": "catalog-service",
    "path": "repos/catalog-service",
    "description": "Spring Boot book catalogue"
  },
  "components": [
    {
      "name": "BookController",
      "kind": "controller",
      "description": "Serves GET /books and GET /books/{isbn}"
    },
    {
      "name": "BookService",
      "kind": "service",
      "description": "Looks up books and resolves cover-image URLs"
    },
    {
      "name": "BookRepository",
      "kind": "repository",
      "description": "Spring Data JPA repository over the books table"
    },
    {
      "name": "S3CoverUrlResolver",
      "kind": "module",
      "description": "Generates presigned S3 GET URLs for cover images"
    }
  ],
  "relationships": [
    {
      "source": "BookController",
      "target": "BookService",
      "description": "delegates each request"
    },
    { "source": "BookService", "target": "BookRepository", "description": "reads book rows" },
    {
      "source": "BookService",
      "target": "S3CoverUrlResolver",
      "description": "resolves cover URLs"
    }
  ],
  "analysisStatus": "complete",
  "retryCount": 0
}
```

## Field notes

- `kind` is free text, not a closed enum — scoring (FR-015) ignores it entirely when matching
  components, so the extraction procedure is never penalized for choosing a reasonable-but-different
  label (e.g. "handler" vs. "controller").
- `relationships` is intentionally flat and name-based (not component ids) — components are
  identified by `name` throughout this artifact, matching Clarification Q3's scoring rule and keeping
  the artifact hand-authorable without a separate id-generation step.
- A dangling `relationships[].source`/`.target` (a name not present in `components`) is a validation
  failure in `ComponentAnalysisSchema` — enforced by both `validate-components` and
  `attach-components`.
- `components: []` and `relationships: []` are both valid (edge case: a repository too small/uniform
  to have meaningful internal structure).

## The container-match rule (FR-012a)

`attach-components <arch-file> <components-file> --container <name>` checks
`artifact.repository.name` against the given `--container` name (the same name the `import`
pipeline already used to create that container) **after** `ComponentAnalysisSchema` has already
confirmed the file is schema-valid. A mismatch is rejected with a clear error before any `Element`/
`Relationship` is written — this check has no equivalent in `validate-components`, because that
command is handed a bare file with no container to compare against.
