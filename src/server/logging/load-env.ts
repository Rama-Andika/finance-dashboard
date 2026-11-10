let loaded = false

/**
 * Same rule as src/server/env.ts: when DATABASE_URL is not set, the settings come from the .env file in the folder the
 * server was started in. The logger starts before env.ts is loaded and reads LOG_LEVEL, LOG_DIR, APP_TIMEZONE and
 * CLIENT_ID, so it loads the file first. A variable that is already set always wins. Does nothing under Vitest.
 * No server-only marker: scripts and tests load this file.
 */
export function loadDotEnvOnce(load: (file: string) => void = (file) => process.loadEnvFile(file)): void {
  if (loaded) return
  loaded = true
  if (process.env.VITEST || process.env.DATABASE_URL) return
  try {
    load('.env')
  } catch {
    /* no .env file: the settings come from the real environment */
  }
}

/** For tests: allow the file to be loaded again. */
export function resetDotEnvForTests(): void {
  loaded = false
}
