import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: pg.Pool | undefined;
}

export function createPool(): pg.Pool {
  if (!globalThis._postgresPool) {
    const isSocket = process.env.SQL_HOST?.startsWith('/');
    globalThis._postgresPool = new Pool({
      host: process.env.SQL_HOST || '127.0.0.1',
      port: isSocket ? undefined : (process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    // Prevent unhandled pool-level errors from crashing the application in production
    globalThis._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return globalThis._postgresPool;
}

export const pool = createPool();
export const db = drizzle(pool, { schema });
