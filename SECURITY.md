# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities via:

TODO(CONTACT_EMAIL): Add a monitored security contact (email or GitHub Security Advisories process).

Include:

- a description of the issue and potential impact
- steps to reproduce (proof-of-concept if possible)
- affected versions/areas (if known)

## LLM / external-service surface

- The shipped `@arch-atlas/llm-importer` package makes **no** model call and **no** network request
  under any configuration — it operates entirely on local files.
- `@arch-atlas/analysis-runner-local` contacts **only** the user-configured local model endpoint
  (no hosted/cloud service); every request is time-bounded, and prompts, responses, and API keys are
  never logged in full.
- The `plugins/repo-analysis` skill is an **opt-in** producer that sends a repository's
  context bundle to a hosted model API. The bundle never contains files excluded by the secret-path
  rules (`.env`, `*.key`, `*.pem`, `*secret*`, `*credential*`, `*password*`, `node_modules/`, …).
  Use `@arch-atlas/analysis-runner-local` to stay offline.

## Supported versions

This project aims to track supported runtimes and keep dependencies current. Security fixes will target
supported versions only.
