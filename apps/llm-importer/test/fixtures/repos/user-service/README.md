# user-service

Owns user accounts. Exposes a small HTTP API for user CRUD, persists to PostgreSQL,
and publishes a `user-created` event to Kafka when a new account is registered.
Calls notification-service (through the API gateway) to send welcome notifications.
