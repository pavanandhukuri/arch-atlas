import express from 'express';
import { randomUUID } from 'node:crypto';
import { priceOf } from './catalog-client';
import { charge } from './payments';
import { bus } from './events';
import { pool } from './db';

const app = express();
app.use(express.json());

/** Place an order: price it from the catalog, charge the card, store it, announce it. */
app.post('/orders', async (req, res) => {
  const { isbn, quantity, paymentMethod, email } = req.body as {
    isbn: string;
    quantity: number;
    paymentMethod: string;
    email: string;
  };

  const total = (await priceOf(isbn)) * quantity;
  await charge(total, paymentMethod);

  const id = randomUUID();
  await pool.query(
    'INSERT INTO orders (id, isbn, quantity, total, email) VALUES ($1, $2, $3, $4, $5)',
    [id, isbn, quantity, total, email]
  );
  await bus.publish('order.placed', { id, isbn, quantity, total, email });

  res.status(201).json({ id, total });
});

app.get('/orders/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).end();
  return res.json(rows[0]);
});

app.listen(8082, () => console.log('order-service listening on :8082'));
