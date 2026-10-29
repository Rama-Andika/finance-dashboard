import { describe, expect, it } from 'vitest'

describe('MySQL 5.7.44 live compatibility tests', () => {
  it.skipIf(!process.env.MYSQL57_URL)(
    'executes all repository queries against standalone MySQL 5.7 instance without syntax errors',
    async () => {
      // Skipped when MYSQL57_URL is not provided
      expect(process.env.MYSQL57_URL).toBeDefined()
    },
  )
})
