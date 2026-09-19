import { Pool } from 'pg';

/** Orders live in PostgreSQL. */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://orders@postgres:5432/orders',
});
