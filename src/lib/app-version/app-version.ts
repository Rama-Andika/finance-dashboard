/**
 * The version of this build as the browser bundle and the server bundle both know it. Vite replaces __APP_VERSION__ while
 * building (see vite.config.ts): the git tag, for example "v1.4.2"; in `npm run dev` it is "dev". Outside Vite (unit tests)
 * the constant does not exist and the version is "dev".
 */
declare const __APP_VERSION__: string

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** The response header on which the server tells its version (a header name is case-insensitive; written in lower case). */
export const APP_VERSION_HEADER = 'x-app-version'
