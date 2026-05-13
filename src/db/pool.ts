import { Pool, type QueryResultRow } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL missing in environment variables');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
});

export async function query<T extends QueryResultRow>(
  text: string,
  params?: any[]
) {
  const start = Date.now();

  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (duration > 100) {
      console.log(`[DB SLOW QUERY] ${duration}ms: ${text.slice(0, 60)}...`);
    }

    return res;
  } catch (error) {
    console.error('[DB ERROR]', error);
    throw error;
  }
}

export const getClient = () => pool.connect();
export { pool };