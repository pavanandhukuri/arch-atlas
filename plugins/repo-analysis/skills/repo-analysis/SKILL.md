---
name: repo-analysis
description: Run the arch-atlas repo importer end-to-end for a workspace's import.yaml — gathers context, analyzes every listed repository, and correlates them into architecture.review.yaml / architecture.arch.json, ready for Studio's import wizard. Also handles a single repository or a context bundle. Use when the user wants to run the arch-atlas repo importer with Claude Code.
---

# repo-analysis (Claude Code)

Follow the procedure in [`../../AGENTS.md`](../../AGENTS.md) — that file is the canonical,
tool-neutral version of this skill (it works the same way under any AGENTS.md-aware coding
agent, not only Claude Code) and is kept in sync with this one. This `SKILL.md` exists only so
Claude Code can discover and auto-invoke the procedure by name.

A worked example is in `sample-analysis.json` beside this file.
