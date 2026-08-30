import { createProxyMiddleware } from 'http-proxy-middleware';
import express from 'express';

const app = express();

// Gateway-prefixed routes proxied to the downstream services.
app.use('/api/users', createProxyMiddleware({ target: 'http://user-service:3000' }));
app.use(
  '/api/notifications',
  createProxyMiddleware({ target: 'http://notification-service:3000' })
);
app.use('/api/audit', createProxyMiddleware({ target: 'http://audit-service:8080' }));

// Health probe hits notification-service's /v1/send-shaped path downstream.
export async function probe() {
  return fetch('/api/notifications/v1/send', { method: 'POST' });
}

export { app };
