# order-service

Express + TypeScript service that places orders. For each `POST /orders` it looks up the price
in **catalog-service**, charges the card with **Stripe**, stores the order in **PostgreSQL** and
publishes an `order.placed` event to **Kafka**.
