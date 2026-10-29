/**
 * The router types the previous search params per route, which makes shared "merge into the URL"
 * callbacks impossible to express. The URL is validated again by each route's search schema,
 * so the updater is typed loosely here, in one place.
 */
export type SearchUpdate = (prev: Record<string, unknown>) => Record<string, unknown>

export function searchUpdater(update: SearchUpdate): never {
  return update as never
}
