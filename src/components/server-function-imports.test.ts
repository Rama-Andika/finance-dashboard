import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Data is read through `src/queries/` (queryOptions); a component does not call a server function to read. A component
 * may call a server function directly only to change something (sign out, save, refresh, report an error). This test lists
 * the files that do, so a new direct import shows up in review: add the file here only when it changes something.
 */
const MAY_CALL_SERVER_FUNCTIONS = [
  'layout/client-error-reporting.ts', // reports an error that happened in the browser
  'layout/prefs-context.tsx', // saves the language and the theme
  'layout/top-bar/TopBarParts.tsx', // signs out
  'layout/use-snapshot-refresh.ts', // starts "Refresh now"
  'settings/use-account-mapping-editor.ts', // saves the account mapping
]

const COMPONENTS = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
  })
}

describe('components and server functions', () => {
  it('only the listed files import a server function directly', () => {
    const files = sourceFiles(COMPONENTS)
    expect(files.length).toBeGreaterThan(50) // the scan reaches the sub folders
    const importing = files
      .filter((file) => /from\s+['"]~\/functions\//.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(COMPONENTS, file).split(path.sep).join('/'))
      .sort()
    expect(importing).toEqual([...MAY_CALL_SERVER_FUNCTIONS].sort())
  })
})
