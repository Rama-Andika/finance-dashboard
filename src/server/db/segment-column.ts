const SEGMENT_COLUMN_RE = /^segment([1-9]|1[0-5])_id$/

export function isSegmentColumn(name: string): boolean {
  return SEGMENT_COLUMN_RE.test(name)
}

/** Validates a `segmentN_id` column name before it is used as a SQL identifier. */
export function assertSegmentColumn(name: string): string {
  if (!isSegmentColumn(name)) throw new Error(`Invalid segment column: ${name}`)
  return name
}
