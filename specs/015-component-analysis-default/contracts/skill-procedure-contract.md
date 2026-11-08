# Contract: SKILL.md's Default Per-Repository Loop

> Updated 2026-11-08 — steps 1–6 are unchanged from the original contract; step 7 (the hand-off) is
> rewritten, since there is no longer a Studio upload slot or `attach-components` call for the agent
> to direct a human toward. See `spec.md`'s Clarifications and `research.md` #5.

For a whole-workspace import request (`import.yaml` present), the main Procedure's per-repository
loop (today: read bundle → determine external interface → write `{repo}.analysis.json`) gains one
more unconditional step per repository:

1. Read the bundle (unchanged).
2. Determine the external interface, write `{repo}.analysis.json` (unchanged).
3. **New, unconditional**: using the same bundle, determine the repository's major internal
   components and their relationships (the same judgment 014's "Component drill-down" mode already
   described), write `{repo}.components.json`. `analysisStatus: "partial"` if low-confidence —
   never an error, never a reason to skip the repository (FR-008).
4. Repeat for every repository in the workspace (unchanged loop structure).
5. Run `import <import.yaml>` as before — unaffected in _what it writes for connections_, but it
   now also reads every `{repoName}.components.json` found and folds each one onto that
   repository's `repos[]` entry in `architecture.review.yaml` (see `import-cli-contract.md`).
6. Report **only** the `architecture.review.yaml` path — that single file already carries both
   passes' output for every repository. There is no `attach-components` CLI call for the agent to
   make, and no second file to tell the human about: upload that one path into Studio's import
   wizard and every container already shows its internal components.

014's standalone "Component drill-down (optional)" section is retired as a separately-invoked mode
(Clarification Q2 — no opt-out, no second mode to choose between); its procedure content moves into
the main loop as step 3 above. The `validate-components` and `attach-components` CLI commands
remain in the codebase, unchanged (FR-011), for the one case in Edge Cases where `import` is no
longer in the loop at all: a human has already finalized a diagram outside the wizard and wants to
refresh one repository's components directly into that saved `.arch.json`.
