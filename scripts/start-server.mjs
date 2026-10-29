// Production Node server: serves the built client assets and forwards every other request
// to the TanStack Start fetch handler in dist/server/server.js. No extra dependencies.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const clientDir = join(root, 'dist', 'client')
const serverEntryPath = join(root, 'dist', 'server', 'server.js')

const { default: serverEntry } = await import(pathToFileURL(serverEntryPath).href)
if (!serverEntry || typeof serverEntry.fetch !== 'function') {
  throw new Error(`No fetch handler exported by ${serverEntryPath}. Run "npm run build" first.`)
}

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
// Only trust an incoming X-Forwarded-For header when a reverse proxy in front of us sets it.
const trustProxy = process.env.TRUST_PROXY === '1'

const MIME_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Returns the absolute file path when the URL points to a file inside dist/client, otherwise null. */
async function resolveStaticFile(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded === '/' || decoded.endsWith('/')) return null
  const filePath = resolve(clientDir, '.' + decoded)
  if (filePath !== clientDir && !filePath.startsWith(clientDir + sep)) return null // path traversal
  try {
    const info = await stat(filePath)
    return info.isFile() ? filePath : null
  } catch {
    return null
  }
}

function toWebHeaders(req) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  // The login rate limiter keys on the client IP (data-model §9.3). A client-supplied header
  // could be spoofed to dodge it, so it is replaced by the socket address unless TRUST_PROXY=1.
  const socketIp = req.socket.remoteAddress ?? ''
  if (!trustProxy) {
    headers.set('x-forwarded-for', socketIp)
  } else if (!headers.has('x-forwarded-for')) {
    headers.set('x-forwarded-for', socketIp)
  }
  return headers
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const method = req.method ?? 'GET'

    if (method === 'GET' || method === 'HEAD') {
      const filePath = await resolveStaticFile(url.pathname)
      if (filePath) {
        res.statusCode = 200
        res.setHeader('content-type', MIME_TYPES[extname(filePath)] ?? 'application/octet-stream')
        // Hashed build assets never change; everything else is revalidated.
        res.setHeader(
          'cache-control',
          url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
        )
        if (method === 'HEAD') return res.end()
        createReadStream(filePath).pipe(res)
        return
      }
    }

    const hasBody = method !== 'GET' && method !== 'HEAD'
    const request = new Request(url, {
      method,
      headers: toWebHeaders(req),
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    })

    const response = await serverEntry.fetch(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length > 0) res.setHeader('set-cookie', cookies)

    if (!response.body || method === 'HEAD') return res.end()
    Readable.fromWeb(response.body).pipe(res)
  } catch (error) {
    console.error('Request failed:', error instanceof Error ? error.message : error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
    }
    res.end('Internal Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`Finance Dashboard listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
})
