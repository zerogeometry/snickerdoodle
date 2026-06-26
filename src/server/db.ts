import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';

/**
 * A Drizzle handle over the trust-spine schema. Server-data functions take this
 * explicitly (rather than reaching for a singleton) so a request, a job, a seed,
 * or a test can each pass its own connection.
 */
export type DbHandle = PostgresJsDatabase<typeof schema>;
