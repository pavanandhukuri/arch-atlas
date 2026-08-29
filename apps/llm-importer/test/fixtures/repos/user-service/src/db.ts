import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getUser(id: string) {
  return pool.query('SELECT * FROM users WHERE id = $1', [id]);
}
