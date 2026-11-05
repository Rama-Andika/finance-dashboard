import '@tanstack/react-start/server-only'
import mysql from 'mysql2/promise'
import { env } from '~/server/env'

declare global {
  var __nrRefreshPool: mysql.Pool | undefined
}

/**
 * Connections for the background refresh (snapshot building) only. A rebuild can hold a connection for minutes; with
 * its own pool it never competes with the requests of signed-in users for the (small) main pool.
 * Same options as the main pool, because the refresh code reads rows as strings (G11-G13). No per-query time limit:
 * every refresh step turns the limit off for its own connection.
 */
export const refreshPool =
  globalThis.__nrRefreshPool ??
  mysql.createPool({
    uri: env.DATABASE_URL,
    connectionLimit: env.DASH_POOL_SIZE,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    dateStrings: true,
    charset: 'utf8mb4',
    waitForConnections: true,
  })
globalThis.__nrRefreshPool = refreshPool
