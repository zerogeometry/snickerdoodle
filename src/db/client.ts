import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazily created so importing the schema (e.g. in tests, or drizzle-kit) never
// opens a connection. The connection string points at the UK/EU Postgres and is
// only present at runtime — never committed. (Add `import 'server-only'` once the
// Next.js app shell lands, to keep this off the client bundle.)
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db === null) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _client = postgres(url, { prepare: false });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
