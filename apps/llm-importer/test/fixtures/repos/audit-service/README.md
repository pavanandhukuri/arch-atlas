# audit-service

A Go service that consumes the `user-created` Kafka topic and records an entry in
the `audit_log` PostgreSQL table. Also exposes `POST /v1/audit` (behind the
gateway prefix `/api/audit`) for manual audit entries.
