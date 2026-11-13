import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { htmlBalanceProblems } from './html-balance.mjs'

/**
 * Keeps docs/release-deploy-guide.html in step with the code: the npm scripts, files and script messages it names must
 * exist, its section ids must be unique and reachable, every id that code or docs link to must exist, and nothing may
 * still point at the documents that were merged into it.
 */
const root = resolve(import.meta.dirname, '..', '..')
const GUIDE_PATH = 'docs/release-deploy-guide.html'
const html = readFileSync(join(root, GUIDE_PATH), 'utf8')
const projectGuide = readFileSync(join(root, 'docs', 'project-guide.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** The tokens the "Isi dulu" form fills into the commands (data-tpl attributes). */
const KNOWN_TOKENS = [
  'CLIENT',
  'ENV',
  'PORT',
  'PARENT',
  'PKG',
  'DOMAIN',
  'RELNAME',
  'DIR',
  'ROOT',
  'INSTANCE',
  'PREFIX',
  'TAG',
]

/** [source file, text the source must contain, text the guide must contain]. Both texts are plain strings. */
const MESSAGES = [
  ['scripts/release/release-flow.mjs', 'you are on branch "', 'you are on branch "'],
  ['scripts/release/release-flow.mjs', 'the working tree has changes', 'the working tree has changes'],
  ['scripts/release/release-flow.mjs', 'is not in step with origin/', 'is not in step with origin/'],
  ['scripts/release/release-flow.mjs', '"git fetch origin" failed', '"git fetch origin" failed'],
  [
    'scripts/release/release-flow.mjs',
    'commit(s) do not follow "type(scope): text"',
    'commit(s) do not follow "type(scope): text"',
  ],
  [
    'scripts/release/release-flow.mjs',
    ' does not exist. Write it with "npm run release -- notes"',
    ' does not exist. Write it with "npm run release -- notes"',
  ],
  [
    'scripts/release/release-rules.mjs',
    'still has the ${NOTES_PLACEHOLDER} placeholder',
    'still has the TODO placeholder',
  ],
  ['scripts/release/release-flow.mjs', 'there is no release candidate of', 'there is no release candidate of'],
  [
    'scripts/release/release-flow.mjs',
    'these files changed, which a stable release may not contain',
    'these files changed, which a stable release may not contain',
  ],
  ['scripts/release/release-flow.mjs', 'the gate "${gate}" failed', 'the gate "lint" failed'],
  ['scripts/release/release-flow.mjs', 'the build changed tracked files', 'the build changed tracked files'],
  [
    'scripts/release/release-flow.mjs',
    'already exists. A tag is never moved or deleted',
    'already exists. A tag is never moved or deleted',
  ],
  [
    'scripts/release/release-flow.mjs',
    'a patch release has no release candidate',
    'a patch release has no release candidate',
  ],
  ['scripts/release/release-flow.mjs', 'release-it stopped with exit code', 'release-it stopped with exit code'],
  ['scripts/deploy/package-flow.mjs', 'this version cannot be packaged', 'this version cannot be packaged'],
  [
    'scripts/deploy/package-rules.mjs',
    'there are uncommitted changes to tracked files; commit or stash them first',
    'there are uncommitted changes to tracked files; commit or stash them first',
  ],
  ['scripts/deploy/package-flow.mjs', 'the build says version "', 'the build says version "'],
  [
    'scripts/deploy/package-flow.mjs',
    'the build in dist/ was made for CLIENT_ID',
    'the build in dist/ was made for CLIENT_ID',
  ],
  ['scripts/lib/version-rules.mjs', 'cannot go to production', 'cannot go to production'],
  ['scripts/lib/install-flow.mjs', 'this package was built for CLIENT_ID', 'this package was built for CLIENT_ID'],
  ['scripts/lib/install-flow.mjs', 'INSTALLED', 'INSTALLED'],
  ['scripts/lib/install-flow.mjs', 'ROLLED BACK', 'ROLLED BACK'],
  ['scripts/lib/install-flow.mjs', 'ACTION NEEDED', 'ACTION NEEDED'],
  ['scripts/lib/install-flow.mjs', 'PREPARED', 'PREPARED'],
]

/** Decodes the few entities the guide uses. */
function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

/** The text a reader sees: no scripts, no styles, no tags, entities decoded. */
const visibleText = decode(
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' '),
)

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])

const SKIP_DIRS = new Set(['node_modules', 'dist', 'release-packages', 'plans', 'logs', '.git', 'coverage', '.output'])
const TEXT_FILE = /\.(ts|tsx|mjs|js|json|md|html|sql|css|csv)$/

/** @param {string} dir @returns {string[]} absolute paths of the text files below a folder */
function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(root, full).split(sep).join('/')
    if (SKIP_DIRS.has(entry.name) || rel === 'docs/design') continue
    if (entry.isDirectory()) files.push(...walk(full))
    else if (TEXT_FILE.test(entry.name)) files.push(full)
  }
  return files
}

/** The files that must not point at the old documents: everything except history and the guide's own checks. */
const EXCLUDED = new Set(['scripts/docs/guide-sync.test.mjs', 'docs/progress.md', 'docs/project-guide.md'])
const scanned = [
  ...['scripts', 'src', 'tests', 'docs'].flatMap((dir) => walk(join(root, dir))),
  join(root, 'CLAUDE.md'),
  join(root, '.env.example'),
]
  .map((file) => ({ path: relative(root, file).split(sep).join('/'), file }))
  .filter(({ path }) => !EXCLUDED.has(path))
  .map(({ path, file }) => ({ path, text: readFileSync(file, 'utf8') }))

describe('docs/release-deploy-guide.html: structure', () => {
  it('has tags that open and close in order', () => {
    expect(htmlBalanceProblems(html)).toEqual([])
  })

  it('has unique ids', () => {
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })

  it('has unique checkbox ids', () => {
    const checks = [...html.matchAll(/data-chk="([^"]+)"/g)].map((match) => match[1])
    expect(checks.filter((id, index) => checks.indexOf(id) !== index)).toEqual([])
  })

  it('links only to ids that exist', () => {
    const links = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])
    expect([...new Set(links.filter((id) => !ids.includes(id)))]).toEqual([])
  })

  it('uses only the form tokens that the script fills in', () => {
    const used = new Set(
      [...html.matchAll(/data-tpl="([^"]*)"/g)].flatMap((match) =>
        [...match[1].matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]),
      ),
    )
    expect([...used].filter((token) => !KNOWN_TOKENS.includes(token))).toEqual([])
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
    expect(KNOWN_TOKENS.filter((token) => !new RegExp(`\\b${token}:`).test(script))).toEqual([])
  })

  it('does not mention the planning folder', () => {
    expect(html).not.toMatch(/plans\//)
  })
})

describe('docs/release-deploy-guide.html: what it says exists', () => {
  it('names only npm scripts that exist', () => {
    const names = [...visibleText.matchAll(/npm run ([a-z][a-z0-9:-]*[a-z0-9])/g)].map((match) => match[1])
    const known = Object.keys(packageJson.scripts)
    expect([...new Set(names.filter((name) => !known.includes(name)))]).toEqual([])
    expect(names.length).toBeGreaterThan(5)
  })

  it('names only files and folders that exist', () => {
    const missing = []
    for (const raw of visibleText.split(/\s+/)) {
      const token =
        raw
          .replace(/^[("'`]+/, '')
          .replace(/[),.;:"'`]+$/, '')
          .split('#')[0] ?? ''
      if (!/^(scripts|src|docs|tests|drizzle-dash)\//.test(token)) continue
      if (/[<>{}*]|\.\.\.|…|X\.Y\.Z|v\d+\.\d+/.test(token)) continue
      if (!existsSync(join(root, token))) missing.push(token)
    }
    expect([...new Set(missing)]).toEqual([])
  })

  it('quotes script messages that the scripts really print', () => {
    const problems = []
    for (const [file, inSource, inGuide] of MESSAGES) {
      if (!readFileSync(join(root, file), 'utf8').includes(inSource))
        problems.push(`${file} no longer contains: ${inSource}`)
      if (!visibleText.includes(inGuide)) problems.push(`the guide no longer contains: ${inGuide}`)
    }
    expect(problems).toEqual([])
  })
})

describe('the documents that were merged into the guide', () => {
  it('are no longer mentioned by code, tests, or other docs', () => {
    const forbidden = [
      /release-runbook/,
      /emergency-branch/,
      /(?<!release-)deploy-guide\.html/,
      /(chapters?|bab) 10\.9/,
    ]
    const found = []
    for (const { path, text } of scanned) {
      for (const pattern of forbidden) if (pattern.test(text)) found.push(`${path}: ${pattern}`)
    }
    expect(found).toEqual([])
  })

  it('leave project-guide.md with pointers only', () => {
    const history = projectGuide.indexOf('\n## 14. Riwayat perubahan')
    const stubStart = projectGuide.indexOf('### 10.9 Rilis dan deploy (dipindahkan)')
    const stubEnd = projectGuide.indexOf('### 10.10 ')
    expect(history).toBeGreaterThan(0)
    expect(stubStart).toBeGreaterThan(0)
    expect(stubEnd).toBeGreaterThan(stubStart)
    const checked = (projectGuide.slice(0, history).slice(0, stubStart) + projectGuide.slice(0, history).slice(stubEnd))
      .split('\n')
      .filter((line) => !/^#{3,4} 10\./.test(line))
      .join('\n')
    const found = [
      [/\b10\.9\.\d/g, '10.9.x'],
      [/\b10\.7\.[45]\b/g, '10.7.4 or 10.7.5'],
      [/\b10\.8\.[34]\b/g, '10.8.3 or 10.8.4'],
      [/release-runbook/g, 'release-runbook'],
      [/emergency-branch/g, 'emergency-branch'],
      [/(?<!release-)deploy-guide\.html/g, 'old deploy-guide.html'],
    ].filter(([pattern]) => [...checked.matchAll(pattern)].length > 0)
    expect(found.map(([, name]) => name)).toEqual([])
  })

  it('point at ids that exist in the guide', () => {
    const stub = projectGuide.slice(
      projectGuide.indexOf('### 10.9 Rilis dan deploy (dipindahkan)'),
      projectGuide.indexOf('### 10.10 '),
    )
    const wanted = new Map()
    for (const match of stub.matchAll(/`#([a-z][a-z0-9-]*)`/g)) wanted.set(match[1], 'project-guide.md')
    for (const { path, text } of scanned) {
      for (const match of text.matchAll(/release-deploy-guide\.html#([a-z][a-z0-9-]*)/g)) wanted.set(match[1], path)
    }
    expect(wanted.size).toBeGreaterThan(10)
    expect([...wanted].filter(([id]) => !ids.includes(id)).map(([id, from]) => `${from}: #${id}`)).toEqual([])
  })
})
