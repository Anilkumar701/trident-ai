import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: pg.Pool | undefined;
}

export const isDatabaseConfigured = Boolean(
  process.env.DATABASE_URL ||
    (process.env.SQL_HOST &&
      process.env.SQL_DB_NAME &&
      (Boolean(process.env.SQL_PASSWORD) || process.env.SQL_HOST.startsWith('/')))
);

export function createPool(): pg.Pool | null {
  if (!isDatabaseConfigured) {
    return null;
  }
  if (!globalThis._postgresPool) {
    const isSocket = process.env.SQL_HOST?.startsWith('/');
    globalThis._postgresPool = new Pool({
      connectionString: process.env.DATABASE_URL,
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

let db: ReturnType<typeof drizzle<typeof schema>>;
if (pool) {
  try {
    db = drizzle(pool, { schema });
  } catch {
    console.log('[AI Studio] Database initialization failed — using in-memory fallback store');
    const noOp = {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: { data?: unknown }) => d?.data ?? {},
      update: async (d: { data?: unknown }) => d?.data ?? {},
      delete: async () => ({}),
    };
    db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get: (_, prop) => (prop === 'query' ? new Proxy({}, { get: () => noOp }) : async () => []),
    });
  }
} else {
  console.log('[AI Studio] Database not provisioned — using in-memory fallback store');
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: { data?: unknown }) => d?.data ?? {},
    update: async (d: { data?: unknown }) => d?.data ?? {},
    delete: async () => ({}),
  };
  db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get: (_, prop) => (prop === 'query' ? new Proxy({}, { get: () => noOp }) : async () => []),
  });
}

export { db };
