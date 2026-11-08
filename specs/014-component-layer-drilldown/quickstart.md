# Quickstart: Component-Layer Drill-Down

## Run the component eval

```bash
pnpm --filter @archatlas/llm-importer run eval:components            # report
pnpm --filter @archatlas/llm-importer run eval:components -- --check # CI mode
pnpm --filter @archatlas/llm-importer run eval:components -- --set catalog-service
```

## Add a third golden dataset

1. Pick a small, already-committed (or newly added) repo tree.
2. `mkdir apps/llm-importer/eval/golden-components/<name>`
3. Write `eval.config.yaml`:
   ```yaml
   name: <name>
   workspace: { local: ../../../../../path/to/repo }
   artifact: <name>.components.json
   repo: { name: <name>, path: <name> }
   ```
4. Hand-author `ground-truth.json` (`components: [...]`, `relationships: [{from,to}]`) by reading the
   real source.
5. Hand-author `<name>.components.json` (the artifact that gets scored).
6. `pnpm --filter @archatlas/llm-importer run eval:components -- --update-baseline`
7. Review the `component-baseline.json` diff and commit it.

## Request a component analysis for one repository and merge it, end-to-end

```bash
# 1. Deterministic — produces {repoName}.context.json, unchanged command
npx --yes @archatlas/llm-importer@latest gather-context import.yaml --repos catalog-service

# 2. Ask your coding agent to follow the "Component drill-down" section of
#    plugins/repo-analysis/skills/import/SKILL.md against that context bundle.
#    It writes {outDir}/catalog-service.components.json.

# 3. Self-check before trusting it
npx --yes @archatlas/llm-importer@latest validate-components architecture-output/catalog-service.components.json

# 4. Merge it straight into your existing diagram, in place — the agent runs this itself
npx --yes @archatlas/llm-importer@latest attach-components \
  my-diagram.arch.json architecture-output/catalog-service.components.json \
  --container catalog-service
```

That's it — no Studio action at all. Reopen `my-diagram.arch.json` in the hosted Studio at
[arch-atlas-studio.vercel.app](https://arch-atlas-studio.vercel.app) (or your own local
`pnpm dev` instance, if you're developing against this repo — either way, just opens the file from
disk): the `catalog-service` container now shows its internal components nested inside it; zoom in
to see them, zoom out to return to the ordinary container view. The components are already part of
that one file, so there's nothing further to save or attach.

No other container, and nothing about `import`'s own output, changes. If `--container` doesn't
match an existing container's name exactly (case/whitespace aside), or more than one container
shares that name, `attach-components` fails with a clear error and writes nothing.
