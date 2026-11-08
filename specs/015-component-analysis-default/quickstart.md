# Quickstart: Component Analysis by Default

> Rewritten 2026-11-08 — the flow below replaces an earlier version that had a human drop a batch
> of `{repo}.components.json` files into a third wizard slot. See `spec.md`'s Clarifications.

## The whole flow, after this feature

```bash
# Exactly the same request as always — nothing new to type or remember
cd /path/to/your/workspace
# ask your coding agent: "import this workspace"
```

Your agent writes, for every repository, `{repo}.analysis.json` **and** `{repo}.components.json`,
then runs `import import.yaml` itself — which now reads every `{repo}.components.json` it finds
and folds each one straight into `architecture-output/architecture.review.yaml`'s `repos[]` entries.

In Studio's import wizard — unchanged, exactly as it worked before this feature:

1. Drop `architecture.review.yaml` into the first slot (required, as always). That's it.
2. Optionally drop an existing `.arch.json` into the second slot, if you're merging into one.
3. Finalize as usual. Every container whose repository had a `{repo}.components.json` now shows
   its internal components nested inside it already — no further request, no CLI command, no
   second file to find or upload.

If a repository's internal-structure pass hadn't finished (or was never run) when `import` ran,
that one container just shows no nested detail — exactly the diagram you'd have gotten before this
feature existed. Nothing breaks, and there's nothing to re-upload: re-run `import` once that
repository's `{repo}.components.json` exists, and its container picks up the detail next time.

## Try it on the Bookshop demo

```bash
git clone https://github.com/pavanandhukuri/arch-atlas.git && cd arch-atlas/examples/bookshop
npx --yes @archatlas/llm-importer@latest import import.yaml
```

`architecture-output/` already has five committed `{repo}.components.json` files (one per
Bookshop service) alongside the committed `{repo}.analysis.json` files — `import` folds all five
into the `architecture.review.yaml` it just wrote. Open the hosted Studio and upload just that one
file: every one of Bookshop's five containers shows its internal components, with nothing else to
upload and no per-container request made.

Verified end-to-end while building this feature: running the command above against the real
Bookshop fixtures and feeding the resulting `architecture.review.yaml` through Studio's
`parseReviewYaml` → `classifyElements` → `buildModel` produces correctly-positioned component
elements under every one of the five containers, from that one file alone.
