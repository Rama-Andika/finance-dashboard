import { defineConfig } from 'drizzle-kit'

/**
 * Migrations for the dashboard's own tables (`dash_*`) only. Never run `drizzle-kit push` with this
 * config or the ERP one. `generate` writes SQL files and does not touch the database.
 */
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env')
  } catch {
    /* generate/check do not need a database */
  }
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/server/dash/schema.ts',
  out: './drizzle-dash',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'mysql://localhost/none' },
  tablesFilter: ['dash_*'],
  migrations: { table: 'dash_migrations' },
})
