import { defineConfig } from 'drizzle-kit';

// `db:generate` only reads the schema (no DB needed). `db:migrate`/`db:push`
// require DATABASE_URL (the UK/EU Postgres).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
