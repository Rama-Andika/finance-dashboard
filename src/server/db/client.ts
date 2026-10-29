import '@tanstack/react-start/server-only'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { env } from '~/server/env'

declare global {
  // eslint-disable-next-line no-var
  var __nrPool: mysql.Pool | undefined
}

/** One pool per server process (reused across hot reloads). */
export const pool =
  globalThis.__nrPool ??
  mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: env.DB_POOL_SIZE,
    supportBigNumbers: true, // G11
    bigNumberStrings: true, // G11
    decimalNumbers: false, // keep DECIMAL as string (G12)
    dateStrings: true, // DATE/DATETIME as string (G13)
    charset: 'utf8mb4',
    waitForConnections: true,
  })
globalThis.__nrPool = pool

export const db = drizzle(pool, { mode: 'default' })
