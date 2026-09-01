# Security Review: Harness-Neutral Importer (010)

Constitution Principle IV. Scope: the LLM-integration and external-egress changes in this feature.

## Importer core (`@arch-atlas/llm-importer`) — egress removed

Before 010 the package embedded `@earendil-works/pi-coding-agent` and made a chat completion per
repository (against a local endpoint) plus an agentic fallback call. After 010:

- No `fetch` / `http` / socket call anywhere in `src/`. Verified by:
  - `test/integration/model-free-pipeline.integration.test.ts` and `test/unit/run-import.test.ts`
    install a `globalThis.fetch` spy and assert **0** calls for a full `import` run.
  - `test/unit/cli.test.ts` asserts the same for `import` and that a `localModel` block in the
    config changes nothing.
- No agent-framework dependency. `test/unit/no-agent-sdk.test.ts` fails if `@earendil-works/*` or
  `typebox` appears in `package.json` or is `require.resolve`-able (SC-002 / FR-002).

**Net effect: the attack surface shrank** — a supply-chain compromise of the pi packages, or of
`typebox`, no longer reaches this tool's users, and the tool has no code path that can exfiltrate a
scanned repository.

## Reference runner (`@arch-atlas/analysis-runner-local`) — local only, bounded, redacted

| Control                                                                              | Where                                                                                          | Test                                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Contacts **only** `config.localModel.endpoint`                                       | `openai-client.ts` builds exactly one URL: `{endpoint}/chat/completions`                       | `openai-client.test.ts` asserts the URL                                    |
| Every request is time-bounded (default 120s), combined with any caller `AbortSignal` | `combinedSignal()` in `openai-client.ts`                                                       | `openai-client.test.ts` "aborts when timeoutMs elapses" (LR7)              |
| Prompt, response body, and `apiKey` never logged in full                             | only a ≤200-char, whitespace-collapsed preview at `ARCH_ATLAS_DEBUG` (debug) level             | `openai-client.test.ts` "never logs the full prompt … or the apiKey" (LR8) |
| `apiKey` sent only as `Authorization: Bearer` to the configured host                 | `openai-client.ts` headers                                                                     | —                                                                          |
| No hosted/cloud path exists                                                          | there is no non-local code branch; `RunnerConfigSchema.localModel` is the only endpoint source | —                                                                          |

The runner reuses the importer's **unchanged** `gatherContext` for the repo-walk case, so the
secret-path exclusion set (`.env`, `*.key`, `*.pem`, `*secret*`, `*credential*`, `*password*`,
`node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`) still gates every file before
it can enter a prompt.

## Claude Code skill (`.claude/skills/repo-analysis`) — the opt-in hosted path

This is the one component that talks to a hosted model API, and only when a maintainer chooses to
run it.

- It consumes the **context bundle** (`{repo}.context.json`), which `serializeContextBundle`
  produces from `gatherContext` output and **re-asserts** against `matchesSecretPattern` — throwing
  rather than serialising if an excluded path somehow reached it (`context-bundle.ts`; test
  `context-bundle.test.ts` CB1 over the `user-service` fixture with its planted `.env`).
- `SKILL.md` instructs: when given a bundle, do **not** open any other file in the repository
  (SK2). `README.md` states the hosted-API trade-off and points at the offline runner (SK3).
  Enforced by `test/unit/skill-sample.test.ts`.
- The skill sends only what the offline runner would send to a local model — the same
  secret-scrubbed bundle. It does not transmit credentials, and it is not wired into any automated
  flow.

## Residual risk / notes

- A third-party producer is outside our control by design; the contract
  (`analysis-producer-contract.md`) documents that it must write atomically and must not read repo
  files when handed a bundle, but the importer only enforces schema validity on intake.
- `architecture.extra-connections.json` is producer-authored; `readExtraConnections` hard-fails on a
  malformed file (it was deliberately produced) rather than silently ignoring it.

## Conclusion

The feature **reduces** external-service and supply-chain exposure for the default (shipped) tool,
confines the local-model path to a clearly-scoped package with timeout + redaction controls, and
isolates the single hosted-API path into an explicitly opt-in, documented skill that only ever
transmits already-secret-scrubbed context. No unresolved Principle IV concerns.
