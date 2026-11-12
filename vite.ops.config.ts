import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Bundles the command line scripts that must run on a server (no tsx, no src/): scripts/dash-*.ts and scripts/logs-find.ts.
// Output: dist/ops/<script name>.mjs. Packages from node_modules are not bundled; the server has them from npm ci.
// Run it AFTER "vite build": that one empties dist/, and this one writes dist/ops/.
const scriptsDirectory = fileURLToPath(new URL('./scripts/', import.meta.url))
const entries = readdirSync(scriptsDirectory).filter(
  (file) => /^(dash-.+|logs-find)\.ts$/.test(file) && !file.endsWith('.test.ts'),
)

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // The server-only marker only matters inside the TanStack Start build; here it is replaced by an empty module.
      '@tanstack/react-start/server-only': fileURLToPath(new URL('./tests/empty-module.ts', import.meta.url)),
    },
  },
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'dist/ops',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(entries.map((file) => [file.replace(/\.ts$/, ''), `scripts/${file}`])),
      output: { entryFileNames: '[name].mjs' },
    },
  },
})
