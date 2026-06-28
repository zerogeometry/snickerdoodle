import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';

/**
 * A Drizzle handle over the trust-spine schema. Server-data functions take this
 * explicitly (rather than reaching for a singleton) so a request, a job, a seed,
 * or a test can each pass its own connection.
 */
export type DbHandle = PostgresJsDatabase<typeof schema>;

/** A transaction handle — the same query surface as {@link DbHandle}, as passed to
 * the `db.transaction(async (tx) => …)` callback. Functions that must run inside a
 * caller's transaction accept `DbHandle | Tx`. */
export type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0];
