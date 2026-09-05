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
- `plugins/repo-analysis` is a skill/plugin, not code arch-atlas runs on your behalf: it's a
  procedure your own coding agent follows. arch-atlas ships no code that itself contacts a model
  endpoint, local or hosted — that traffic, if any, is entirely between your chosen agent and
  whatever model you've configured it to use. The context bundle the procedure reads never
  contains files excluded by the secret-path rules (`.env`, `*.key`, `*.pem`, `*secret*`,
  `*credential*`, `*password*`, `node_modules/`, …), regardless of which agent or model you run
  it with.

## Supported versions

This project aims to track supported runtimes and keep dependencies current. Security fixes will target
supported versions only.
