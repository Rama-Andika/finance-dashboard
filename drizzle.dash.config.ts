import { defineConfig } from 'drizzle-kit'

/**
 * Migrations for the dashboard's own tables (`dash_*`) only. Never run `drizzle-kit push` with this
 * config or the ERP one. `generate` writes SQL files and does not touch the database. It needs no settings:
 * `npm run db:dash:generate` and `npm run db:dash:check` do not go through scripts/local.mjs, and this file never opens an
 * env file.
 */
export default defineConfig({
  dialect: 'mysql',
  schema: './src/server/dash/schema.ts',
  out: './drizzle-dash',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'mysql://localhost/none' },
  tablesFilter: ['dash_*'],
  migrations: { table: 'dash_migrations' },
})
