// Starts the BUILT server (dist/) with a dummy database address and checks the URL prefix it serves, the build info file
// and the checks at start. It needs no database and no env file. Run it after "npm run build" or "npm run build:client -- <client-id>".
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { sealData } from 'iron-session'

const root = resolve(import.meta.dirname, '..')
const base = JSON.parse(readFileSync(join(root, 'dist', 'base-path.json'), 'utf8')).base
const prefix = String(base).replace(/\/+$/, '') // '' for a build for the root
// The CLIENT_ID this build was made for: '/oxy-client-a-finance-dashboard' gives 'client-a'; a build for the root has none.
const clientId = prefix.replace(/^\/oxy-/, '').replace(/-finance-dashboard$/, '')
// Name of the session cookie of this deployment (cookieNameFor in src/lib/core/client-base.ts). The rule is written out
// again on purpose: if it ever changes in one place only, the check below fails.
const sessionCookieName = prefix === '' ? 'nr_session' : `nr_session_${prefix.slice(1)}`

/** A free TCP port chosen by the operating system. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => done(port))
    })
  })
}

const sessionSecret = randomBytes(32).toString('hex')
const port = await freePort()
const origin = `http://127.0.0.1:${port}`
// The settings of the test server. APP_ENV=production on purpose: the rules of production (no APP_TODAY, no debug logs)
// and the check that CLIENT_ID matches the build must hold for the real thing.
const serverEnv = {
  ...process.env,
  APP_ENV: 'production',
  CLIENT_ID: clientId,
  NODE_ENV: 'production',
  APP_TODAY: '',
  // A dummy address on purpose: this check must never reach a real database.
  DATABASE_URL: 'mysql://smoke:smoke@127.0.0.1:1/smoke',
  SESSION_SECRET: sessionSecret,
  DASH_REFRESH_ENABLED: '0',
  AUTO_MIGRATE: '0',
  LOG_TO_FILE: '0',
  LOG_LEVEL: 'silent',
  HOST: '127.0.0.1',
  PORT: String(port),
  TRUST_PROXY: '0',
}
const server = spawn(process.execPath, [join(root, 'scripts', 'start-server.mjs')], {
  cwd: root,
  stdio: 'ignore',
  env: serverEnv,
})
let exited = false
server.once('exit', () => {
  exited = true
})

/** True once the server answers any HTTP request (the first page request also warms up the server-side render). */
async function waitUntilReady() {
  for (let attempt = 0; attempt < 150 && !exited; attempt++) {
    try {
      await fetch(`${origin}${prefix}/login`, { redirect: 'manual' })
      return true
    } catch {
      await new Promise((wait) => setTimeout(wait, 200))
    }
  }
  return false
}

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (${detail})`}`)
}
/** One request without following redirects (files and addresses that must answer at once). */
const get = (path) => fetch(`${origin}${path}`, { redirect: 'manual' })
/** One request that follows redirects, like a browser (a page first redirects to add its default filters). */
const visit = (path) => fetch(`${origin}${path}`)
/** Starts the built server once more with changed settings; it must refuse at once and say why on standard error. */
const startWith = (changes) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'start-server.mjs')], {
    cwd: root,
    env: { ...serverEnv, ...changes },
    encoding: 'utf8',
    timeout: 60_000,
  })

try {
  if (!(await waitUntilReady())) {
    console.log(
      'FAIL  the built server did not start. Did you run "npm run build" first? ("npm start" shows the error.)',
    )
    failed++
  } else {
    console.log(`Checking the build for prefix "${prefix || '/'}" on ${origin}`)
    const login = await visit(`${prefix}/login`)
    const html = await login.text()
    check('the sign-in page answers 200', login.status === 200, `status ${login.status}`)
    check(
      'the redirect that adds the default filters stays inside the prefix',
      new URL(login.url).pathname === `${prefix}/login`,
      `ended on ${new URL(login.url).pathname}`,
    )
    check('page links and scripts start with the prefix', html.includes(`"${prefix}/assets/`), 'no asset link found')
    if (prefix) check('no link points to /assets/ outside the prefix', !html.includes('"/assets/'), 'found "/assets/')

    const stylesheet = /href="([^"]+\.css)"/.exec(html)?.[1]
    if (!stylesheet) {
      check('a stylesheet link exists', false, 'none found in the page')
    } else {
      const css = await get(stylesheet)
      const cacheControl = css.headers.get('cache-control') ?? ''
      check('the stylesheet is served', css.status === 200, `status ${css.status}`)
      check('the stylesheet is cached as immutable', cacheControl.includes('immutable'), cacheControl || 'no header')
      if (prefix) {
        const outside = await get(stylesheet.slice(prefix.length))
        check(
          'the same file outside the prefix is not served (404)',
          outside.status === 404,
          `status ${outside.status}`,
        )
      }
    }

    const protectedPage = await visit(`${prefix}/summary`)
    check(
      'a page that needs a sign-in ends on the sign-in page inside the prefix',
      protectedPage.status === 200 && new URL(protectedPage.url).pathname === `${prefix}/login`,
      `status ${protectedPage.status}, ended on ${new URL(protectedPage.url).pathname}`,
    )

    // A signed-in user who opens the sign-in page is sent on to the page they wanted. The session cookie is made here
    // with the same secret as the server's, so no database is needed (the sign-in page only reads the cookie).
    const session = await sealData({ userId: '1', name: 'smoke' }, { password: sessionSecret, ttl: 60 })
    const signedIn = await fetch(`${origin}${prefix}/login?redirect=%2Fsummary`, {
      redirect: 'manual',
      headers: { cookie: `${sessionCookieName}=${session}` },
    })
    check(
      'a signed-in user on the sign-in page is sent to the wanted page inside the prefix',
      signedIn.headers.get('location') === `${prefix}/summary`,
      `status ${signedIn.status}, location ${signedIn.headers.get('location')}`,
    )

    if (prefix) {
      // An older cookie with the plain name (for example from a root deployment on the same host) must be ignored,
      // otherwise it keeps a user signed in after sign out.
      const oldCookie = await fetch(`${origin}${prefix}/login?redirect=%2Fsummary`, {
        redirect: 'manual',
        headers: { cookie: `nr_session=${session}` },
      })
      check('an old cookie with the plain name is ignored', oldCookie.status === 200, `status ${oldCookie.status}`)
    }

    if (prefix) {
      check('the host root is not served (404)', (await get('/')).status === 404, 'not 404')
      check('a sibling prefix is not served (404)', (await get(`${prefix}x/login`)).status === 404, 'not 404')
    }

    // The build wrote its version (the logger puts it on every line).
    let buildInfo = null
    try {
      buildInfo = JSON.parse(readFileSync(join(root, 'dist', 'build-info.json'), 'utf8'))
    } catch {
      /* reported by the check below */
    }
    check(
      'the build wrote dist/build-info.json with a version',
      typeof buildInfo?.version === 'string' && buildInfo.version !== '',
      'missing, unreadable or empty',
    )

    // The checks at start: a wrong CLIENT_ID or a missing APP_ENV must stop the server before it serves anything.
    const wrongClient = startWith({ CLIENT_ID: 'another-client' })
    check(
      'a server whose CLIENT_ID does not match the build refuses to start',
      wrongClient.status === 1 && wrongClient.stderr.includes('CLIENT_ID'),
      `exit code ${wrongClient.status}`,
    )
    const noEnvironment = startWith({ APP_ENV: '' })
    check(
      'a server without APP_ENV refuses to start',
      noEnvironment.status === 1 && noEnvironment.stderr.includes('APP_ENV'),
      `exit code ${noEnvironment.status}`,
    )
  }
} finally {
  // Wait until the server process is really gone: on Windows, ending Node while it still closes a child crashes it.
  server.kill()
  if (!exited) await new Promise((done) => server.once('exit', done))
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
