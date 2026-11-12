// The three environments. A copy of src/lib/core/app-env.ts for plain Node scripts, which cannot import TypeScript.
// scripts/lib/env-keys.test.mjs fails when the two lists differ.
export const APP_ENVS = ['development', 'staging', 'production']

/** @param {unknown} value */
export function isAppEnv(value) {
  return typeof value === 'string' && APP_ENVS.includes(value)
}
