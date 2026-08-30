# notification-service

Delivers user-facing notifications. Consumes the `user-created` Kafka topic and
exposes `POST /v1/send` (behind the gateway prefix `/api/notifications`) for
ad-hoc sends.
