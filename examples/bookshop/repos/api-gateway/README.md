# api-gateway

Go reverse proxy in front of the Bookshop. Verifies the caller's Keycloak-issued JWT, then
forwards `/api/books/*` to **catalog-service** and `/api/orders/*` to **order-service**.

```bash
docker compose up --build   # gateway on :8080, Keycloak on :8180
```
