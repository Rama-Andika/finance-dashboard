import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A deployment lives under a URL prefix (/oxy-<client>-finance-dashboard). These checks read the source files and fail
 * when code writes an absolute in-app path that would ignore the prefix: a plain anchor, a cookie path, a raw redirect.
 * Fix a failure with withBasePath() or cookiePath from '~/lib/core/base-path'.
 */
const SRC = path.resolve(__dirname, '..', '..')

/** Every non-test .ts or .tsx file below `dir` (relative to src, forward slashes); generated and shadcn files are skipped. */
function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`
    if (entry.isDirectory()) return entry.name === 'shadcn' ? [] : listSourceFiles(relative)
    const isSource =
      /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && entry.name !== 'routeTree.gen.ts'
    return isSource ? [relative] : []
  })
}

/** An internal absolute link written by hand: href="/x" or href={'/x'} (not "https://..." and not "//host"). */
const ABSOLUTE_HREF = /href=(?:"\/(?!\/)|\{\s*['"`]\/(?!\/))/
/** A cookie whose path is the host root. */
const ROOT_COOKIE_PATH = /\bpath:\s*['"]\/['"]/
/** The browser history takes raw URLs, so the path must come through withBasePath. */
const RAW_HISTORY = /history\.(?:push|replace)\((?!withBasePath\()/
/** redirect({ href }) and navigate({ href }) take raw URLs too. */
const RAW_HREF_CALL = /\b(?:redirect|navigate)\(\{\s*href:(?!\s*withBasePath\()/
/** Sending the browser somewhere by assigning window.location (reading window.location.pathname is fine). */
const WINDOW_LOCATION_CHANGE = /window\.location\.(?:href|assign|replace)\s*(?:=|\()/
/** A cookie read, written or deleted under a fixed name; the name must come through cookieName(...). */
const RAW_COOKIE_NAME = /(?:\b(?:getCookie|setCookie|deleteCookie)\(\s*|\bcookieName:\s*)['"`]/

const ALL_DIRS = ['components', 'routes', 'functions', 'queries', 'hooks', 'lib', 'server']

const RULES = [
  { name: 'an absolute href in JSX (use withBasePath)', pattern: ABSOLUTE_HREF, dirs: ['components', 'routes'] },
  { name: 'a cookie path of "/" (use cookiePath)', pattern: ROOT_COOKIE_PATH, dirs: ['server', 'functions'] },
  { name: 'history.push or history.replace without withBasePath', pattern: RAW_HISTORY, dirs: ALL_DIRS },
  { name: 'redirect or navigate with a raw href without withBasePath', pattern: RAW_HREF_CALL, dirs: ALL_DIRS },
  { name: 'a change of window.location', pattern: WINDOW_LOCATION_CHANGE, dirs: ALL_DIRS },
  { name: 'a cookie with a fixed name (use cookieName)', pattern: RAW_COOKIE_NAME, dirs: ['server', 'functions'] },
]

describe('base path guard', () => {
  it('reads the folders it is meant to protect', () => {
    // A lower number means the scan stopped looking in a folder (the repo had 97, 15, 124 and 25 such files when this was written).
    expect(listSourceFiles('components').length).toBeGreaterThanOrEqual(80)
    expect(listSourceFiles('routes').length).toBeGreaterThanOrEqual(12)
    expect(listSourceFiles('server').length).toBeGreaterThanOrEqual(100)
    expect(listSourceFiles('functions').length).toBeGreaterThanOrEqual(20)
  })

  it.each(RULES)('no source file contains $name', ({ pattern, dirs }) => {
    const found: string[] = []
    for (const dir of dirs) {
      for (const file of listSourceFiles(dir)) {
        const text = fs.readFileSync(path.join(SRC, file), 'utf8')
        const match = pattern.exec(text)
        if (match) found.push(`${file}:${text.slice(0, match.index).split('\n').length}: ${match[0]}`)
      }
    }
    expect(found).toEqual([])
  })

  it('uses cookiePath and cookieName for the session cookie and the preference cookies', () => {
    for (const file of ['server/auth/session.ts', 'functions/prefs.fn.ts']) {
      const text = fs.readFileSync(path.join(SRC, file), 'utf8')
      expect(text).toContain('cookieName(')
      expect(text).toContain('path: cookiePath')
    }
  })

  it('detects the mistakes it is meant to find', () => {
    expect(ABSOLUTE_HREF.test('<a href="/summary">')).toBe(true)
    expect(ABSOLUTE_HREF.test("<a href={'/summary'}>")).toBe(true)
    expect(ABSOLUTE_HREF.test("<a href={withBasePath('/summary')}>")).toBe(false)
    expect(ABSOLUTE_HREF.test('<a href="https://example.com">')).toBe(false)
    expect(ABSOLUTE_HREF.test('<a href="//cdn.example.com/x">')).toBe(false)

    expect(ROOT_COOKIE_PATH.test("path: '/',")).toBe(true)
    expect(ROOT_COOKIE_PATH.test('path: cookiePath,')).toBe(false)

    expect(RAW_HISTORY.test('router.history.push(search.redirect)')).toBe(true)
    expect(RAW_HISTORY.test('router.history.push(withBasePath(search.redirect))')).toBe(false)

    expect(RAW_HREF_CALL.test('redirect({ href: search.redirect })')).toBe(true)
    expect(RAW_HREF_CALL.test('redirect({\n  href: search.redirect,\n})')).toBe(true)
    expect(RAW_HREF_CALL.test('redirect({ href: withBasePath(search.redirect) })')).toBe(false)

    expect(WINDOW_LOCATION_CHANGE.test('window.location.href = url')).toBe(true)
    expect(WINDOW_LOCATION_CHANGE.test('window.location.assign(url)')).toBe(true)
    expect(WINDOW_LOCATION_CHANGE.test('window.location.pathname')).toBe(false)

    expect(RAW_COOKIE_NAME.test("getCookie('nr_theme')")).toBe(true)
    expect(RAW_COOKIE_NAME.test("setCookie('nr_lang', value, options)")).toBe(true)
    expect(RAW_COOKIE_NAME.test("cookieName: 'nr_session',")).toBe(true)
    expect(RAW_COOKIE_NAME.test("getCookie(cookieName('nr_theme'))")).toBe(false)
    expect(RAW_COOKIE_NAME.test("cookieName: cookieName('nr_session'),")).toBe(false)
    expect(RAW_COOKIE_NAME.test('setCookie(name, value, cookieOptions)')).toBe(false)
  })
})
