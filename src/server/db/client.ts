import '@tanstack/react-start/server-only'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { env } from '~/server/env'
import { createLogger } from '~/server/log'

declare global {
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

// Per-connection time limit. MySQL 5.7.8+ calls it max_execution_time (ms, SELECT only);
// MariaDB (dev) calls it max_statement_time (seconds). Whichever the server does not know is ignored.
if (env.DB_QUERY_TIMEOUT_MS > 0) {
  pool.pool.on('connection', (conn) => {
    conn.query('SET SESSION max_execution_time = ?', [env.DB_QUERY_TIMEOUT_MS], (err) => {
      if (!err) return
      conn.query('SET SESSION max_statement_time = ?', [env.DB_QUERY_TIMEOUT_MS / 1000], (fallbackErr) => {
        if (fallbackErr) createLogger('db').warn(`no query time limit could be set: ${fallbackErr.message}`)
      })
    })
  })
}

export const db = drizzle(pool, { mode: 'default' })
