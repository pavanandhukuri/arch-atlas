# Contract: `.claude/skills/repo-analysis`

A Claude Code skill that produces a `{repo}.analysis.json` for one repository. The **documented,
opt-in, hosted-API** analysis producer.

## Layout

```
.claude/skills/repo-analysis/
├── SKILL.md            # the skill (front-matter: name, description; body: procedure + inline schema)
├── README.md           # multi-repo walkthrough + the offline-alternative note
└── sample-analysis.json # a committed, hand-authored example RepoAnalysis
```

## Behaviour (SKILL.md procedure)

1. Input: a repo path, or a path to a `{repo}.context.json`.
   - repo path → run `arch-atlas-import gather-context` (or call `gatherContext`) to get the bundle.
   - bundle path → read it; **do not** open other files in the repo (AP2).
2. Read the bundle: description hint, READMEs, manifests + dependency split, directory listing,
   ranked source excerpts, detected route/topic hints.
3. Emit a `RepoAnalysis` JSON object (schema inlined in SKILL.md — description, languages, frameworks,
   `served.{httpRoutes,grpcServices,topics,datastores}`, `outbound[]`, `schemaVersion: '1.0'`,
   `repository`, `analyzedAt`, `analysisStatus`, `retryCount: 0`). Same extraction rules the runner's
   `GUIDANCE` block states (runtime deps only for frameworks; no operational endpoints like
   `/health`, `/actuator/*`; gRPC service names as declared).
4. Write it to `{outDir}/{repoName}.analysis.json`.

## README.md content

- The 3-step loop: `gather-context` once → run this skill per repo → `arch-atlas-import import`.
- **Explicit note**: "This path sends the (secret-scrubbed) context bundle to a hosted model API.
  To stay fully offline, use `packages/analysis-runner-local` instead."
- A pointer to `analysis-producer-contract.md` for anyone writing their own producer.

## Guarantees

| #   | Guarantee                                                           | Maps to                |
| --- | ------------------------------------------------------------------- | ---------------------- |
| SK1 | `sample-analysis.json` satisfies `RepoAnalysisSchema`.              | FR-011, verified in CI |
| SK2 | SKILL.md never instructs reading repo files when handed a bundle.   | FR-005, AP2            |
| SK3 | README states the hosted-API trade-off and the offline alternative. | FR-012                 |

## Tests (`apps/llm-importer/test/unit/skill-sample.test.ts`)

- `RepoAnalysisSchema.safeParse(require('.claude/skills/repo-analysis/sample-analysis.json')).success === true`.
- The sample, fed through `toCorrelationGraph`, yields a graph that `RepositoryKnowledgeGraphSchema`
  accepts (proves it is downstream-usable).
- A lightweight lint of `SKILL.md`: contains the schema field names and the string "opt-in" /
  hosted-API caveat (SK3).
