# notification-service

FastAPI worker. Consumes `order.placed` events from **Kafka**, fetches the book title from
**catalog-service** and sends the customer a confirmation email via **SendGrid**.
