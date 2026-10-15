import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazily created so importing the schema (e.g. in tests, or drizzle-kit) never
// opens a connection. The connection string points at the UK/EU Postgres and is
// only present at runtime — never committed. `import 'server-only'` keeps this — and
// the DATABASE_URL it reads — out of any client bundle via a build-time error.
// ONE pool per process, kept on globalThis: Next's dev server re-evaluates modules on every reload
// (and per route bundle), and a module-level cache then opened a fresh pool each time — they piled
// up until Postgres refused connections. Idle connections close after 20s either way.
type Cached = { db: ReturnType<typeof drizzle<typeof schema>>; client: ReturnType<typeof postgres> };
const g = globalThis as typeof globalThis & { __snickerdoodleDb?: Cached };

export function getDb() {
  if (!g.__snickerdoodleDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const client = postgres(url, { prepare: false, idle_timeout: 20 });
    g.__snickerdoodleDb = { client, db: drizzle(client, { schema }) };
  }
  return g.__snickerdoodleDb.db;
}

export type Db = ReturnType<typeof getDb>;
