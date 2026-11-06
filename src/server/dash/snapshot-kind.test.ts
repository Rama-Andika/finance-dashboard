import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const files = [
  new URL('./snapshot.ts', import.meta.url),
  new URL('./snapshot-hist.ts', import.meta.url),
  new URL('./snapshot-aggregate.ts', import.meta.url),
]

describe('all unallocated table queries filter by kind', () => {
  for (const fileUrl of files) {
    const filename = fileUrl.pathname.split('/').pop()!
    it(`${filename} filters every unallocated read with kind`, () => {
      const content = fs.readFileSync(fileUrl, 'utf8').replace(/\r\n/g, '\n')
      // Split by sql` to get each sql template tag
      const sqlParts = content.split(/sql`/)
      for (let i = 1; i < sqlParts.length; i++) {
        const queryText = sqlParts[i]!.split('`')[0]!
        // Check if query targets unallocated tables
        if (
          queryText.includes('apArUnallocated') ||
          queryText.includes('apArHistUnallocated') ||
          queryText.includes('dash_snap_ap_ar_unallocated') ||
          queryText.includes('dash_snap_ap_ar_hist_unallocated') ||
          queryText.includes('source.unallocated')
        ) {
          if (queryText.includes("kind = 'ignored'")) {
            expect(queryText).toContain("kind = 'ignored'")
          } else {
            expect(queryText).toMatch(/kind\s*=\s*'counted'/)
          }
        }
      }
    })
  }
})
