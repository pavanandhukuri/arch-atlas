# `test/fixtures/`

- `repos/` — sample repositories analyzed by tests. A 4-service, 2-language workspace:
  - **user-service** (TypeScript) — owns accounts; PostgreSQL (`users`); publishes the
    `user-created` Kafka topic; calls notification-service via
    `/api/notifications/v1/send` (gateway-prefixed).
  - **notification-service** (TypeScript) — consumes `user-created`; serves `POST /v1/send`
    (behind the `/api/notifications` gateway prefix).
  - **audit-service** (Go) — consumes `user-created`; PostgreSQL (`audit_log`); serves
    `POST /v1/audit` (behind `/api/audit`).
  - **gateway** (TypeScript, Express) — proxies `/api/users/*`, `/api/notifications/*`,
    `/api/audit/*` to the three services.
  - Known cross-repo edges: user→notification (gateway HTTP), user↛audit↛notification via
    the shared `user-created` topic, gateway→{user,notification,audit} (gateway HTTP),
    user & audit both on PostgreSQL.
- `repos/user-service/.env` — a **planted fake secret**. Proves the FR-015 / SC-007
  exclusion: `src/analysis/gather-context.ts` and the evidence collector must never read it.
- `analyses/` — pre-canned `RepoAnalysis` artifacts (008), one per fixture repo.
- `knowledge-graphs/` — pre-canned 007-era `RepositoryKnowledgeGraph` artifacts (retained
  while 007 code paths still exist; removed with them in 008 Phase 7).
