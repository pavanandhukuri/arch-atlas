# Data Model: endpointPass — a bare data string is not a call

No persisted type changes. This documents the existing in-memory types this feature reads,
the one new pure helper, and the decision table the new guard implements.

## Existing types read (unchanged)

From `apps/llm-importer/src/correlate/evidence/types.ts`:

```ts
export interface UrlLiteral {
  relPath: string;
  line: number;
  path: string; // normalized: dynamic segments collapsed to '*'
  method?: string; // present only when a nearby call-site/options-object hint was found
  template: boolean; // true only for backtick strings with ${...} interpolation
}
```

From `evidence/parsers/routes.ts`:

```ts
export interface EndpointRoute {
  method?: string;
  path: string; // normalized the same way as UrlLiteral.path
}
```

Both `path` fields already go through `normalizeRoutePath`, which collapses `{id}`, `:id`,
`<int:id>`, `${...}`, and bare `$id` segments to `'*'`. The new helper operates on this
already-normalized representation — no new normalization is introduced.

## New helper

`apps/llm-importer/src/correlate/evidence/parsers/routes.ts`:

```ts
/** Count of non-wildcard ('*') segments in an already-normalized path. */
export function staticSegmentCount(path: string): number;
```

Pure, total, no I/O. Input is always a `normalizeRoutePath`-normalized string (either a
`UrlLiteral.path` or an `EndpointRoute.path`); both already guarantee a leading `/` or an
empty string, matching `segmentCount`'s existing precondition.

## New constant

`apps/llm-importer/src/correlate/evidence-passes.ts`:

```ts
/** A served route with this many static segments or fewer carries almost no
 *  distinguishing structure (e.g. '/product/*'); accepting a match against it
 *  requires the literal to carry an actual HTTP-method signal. */
const MIN_STATIC_SEGMENTS_FOR_METHODLESS_MATCH = 1;
```

## Decision table (the new guard, inside the existing `pathsEqual(...)` branch)

| `staticSegmentCount(route.path)` |                               `literal.method`                               | Outcome                                                                          |
| -------------------------------: | :--------------------------------------------------------------------------: | -------------------------------------------------------------------------------- |
|                              ≤ 1 |                                 `undefined`                                  | **Skip** — no call-site signal, route has minimal structure (this feature's fix) |
|                              ≤ 1 | defined (any, non-contradictory — contradictory already `continue`s earlier) | Match, existing weight logic unchanged                                           |
|                              ≥ 2 |                                 `undefined`                                  | Match, existing weight logic unchanged (unaffected by this feature)              |
|                              ≥ 2 |                                   defined                                    | Match, existing weight logic unchanged (unaffected by this feature)              |

Only the first row's behavior changes. `staticSegmentCount` is evaluated on `route.path`
(the callee's declared, trustworthy served route), never on the caller's literal — the
literal's own path is exactly what's under evaluation for having no distinguishing
call-site context.
