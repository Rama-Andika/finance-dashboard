import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { baseUrlForClient } from './src/lib/core/client-base'

// One build per client: CLIENT_ID fixes the URL prefix (/oxy-<CLIENT_ID>-finance-dashboard/). Without it the app is served at the root.
// TanStack Start derives the router basepath, the asset URLs and the server function URLs from this one value.
// This file is evaluated more than once per build, and Vite puts the values of .env into process.env between the evaluations.
// A CLIENT_ID written only in .env would then change the prefix after the first evaluation, and the build files would
// disagree with dist/base-path.json. The first evaluation still sees the real environment of the command, so it decides
// and the later ones reuse its answer: the URL prefix never comes from .env.
process.env.BUILD_CLIENT_ID ??= process.env.CLIENT_ID ?? ''
const base = baseUrlForClient(process.env.BUILD_CLIENT_ID)

/** Writes dist/base-path.json so scripts/start-server.mjs serves exactly the prefix this build was made for. */
function writeBasePathFile(): Plugin {
  return {
    name: 'write-base-path-file',
    apply: 'build',
    closeBundle() {
      mkdirSync(resolve('dist'), { recursive: true })
      writeFileSync(resolve('dist', 'base-path.json'), JSON.stringify({ base }) + '\n')
    },
  }
}

/** The version of this build: the git tag, or the short commit id, with "-dirty" when tracked files were changed ("unknown" without git). */
function gitVersion(): string {
  try {
    const version = execFileSync('git', ['describe', '--tags', '--always', '--dirty'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return version || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Writes dist/build-info.json (version, build time, client). scripts/start-server.mjs hands the version to the logger. */
function writeBuildInfoFile(): Plugin {
  return {
    name: 'write-build-info-file',
    apply: 'build',
    closeBundle() {
      mkdirSync(resolve('dist'), { recursive: true })
      const info = {
        version: gitVersion(),
        builtAt: new Date().toISOString(),
        clientId: process.env.BUILD_CLIENT_ID ?? '',
      }
      writeFileSync(resolve('dist', 'build-info.json'), JSON.stringify(info) + '\n')
    },
  }
}

export default defineConfig({
  base,
  server: { port: 3000 },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: 'server-entry' } }), // MUST come before viteReact()
    viteReact(),
    writeBasePathFile(),
    writeBuildInfoFile(),
  ],
})
