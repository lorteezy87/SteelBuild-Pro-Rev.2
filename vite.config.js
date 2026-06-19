import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// web-ifc's .wasm MUST match the installed web-ifc JS version, or the IFC viewer
// silently renders zero geometry. Copy the wasm straight from node_modules into
// the served /wasm/ path on every build/dev start so the two can never drift
// (the 3D viewer calls IfcAPI.SetWasmPath('/wasm/')). public/wasm is gitignored
// — it's a generated artifact, never committed. Runs regardless of how vite is
// invoked (buildStart fires for `vite build` and `vite` dev alike).
function copyWebIfcWasm() {
  return {
    name: 'copy-web-ifc-wasm',
    buildStart() {
      try {
        const src = path.resolve(__dirname, 'node_modules/web-ifc/web-ifc.wasm')
        const destDir = path.resolve(__dirname, 'public/wasm')
        fs.mkdirSync(destDir, { recursive: true })
        fs.copyFileSync(src, path.join(destDir, 'web-ifc.wasm'))
      } catch (e) {
        this.warn?.('[web-ifc] wasm copy failed (3D viewer will not load): ' + e.message)
      }
    },
  }
}

// Sentry source-map upload runs ONLY when SENTRY_AUTH_TOKEN is present (set as a
// Vercel build env var for production). Local + CI builds have no token, so the
// plugin is skipped entirely and the build is unaffected. org/project come from
// the SENTRY_ORG / SENTRY_PROJECT env vars (set alongside the token). The token
// is NEVER hardcoded — it is read from the environment at build time only.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const enableSentrySourceMaps = Boolean(sentryAuthToken)

function vendorChunk(id) {
  const n = id.replace(/\\/g, '/')

  // Vite's runtime preload helper (`\0vite/preload-helper`) is imported
  // statically by the entry AND by every chunk that uses dynamic import().
  // If Rollup co-locates it with a heavy library chunk, the entry's static
  // `import { __vitePreload } from '<that chunk>'` edge makes the whole library
  // an eager dependency of the entry — Vite then emits a `modulepreload` for it
  // in index.html, pulling megabytes onto the critical path for users who never
  // open that route. pdfjs-dist uses top-level await, which made `vendor-pdf`
  // the anchor the helper attached to, eagerly preloading ~1.2 MB of PDF libs
  // on every page load. Pin the helper to its own tiny chunk so no heavy
  // library can ever be dragged into the boot path through it.
  if (n.includes('vite/preload-helper')) return 'vendor-vite-runtime'

  if (!n.includes('/node_modules/')) return undefined

  // PDF viewing (pdfjs-dist) is loaded by DrawingViewer + thumbnail/extraction
  // flows; keep it isolated so the viewer never pays for export-only weight.
  if (n.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdf'
  // PDF export libs (jspdf + html2canvas) are intentionally NOT pinned to a
  // manual vendor chunk. Pinning them forces a shared static chunk that the
  // vite-plugin-top-level-await dynamic-import helper then makes DrawingViewer
  // import eagerly (the viewer would download ~900 kB of export-only code on
  // open). Leaving them unpinned lets Rollup fold them into the async-only
  // chunk graph reachable solely from the export entry points
  // (ExportMarkupPDFModal, generateTransmittal, exportGanttPdf), so they load
  // on-demand from the export action and never alongside the viewer.
  if (n.includes('/node_modules/xlsx/')) return 'vendor-xlsx'

  // Shared styling micro-utils. These are pulled in by the app-wide `cn()`
  // helper (src/lib/utils -> clsx + tailwind-merge) and by `class-variance-
  // authority`, so they ride along on EVERY route via the shared Button/`cn`
  // chunk. recharts ALSO depends on clsx, so without this rule Rollup parks the
  // single shared clsx module inside `vendor-charts` (one of its importers) and
  // the shared Button/util chunks then statically import it back — dragging the
  // ~596 kB charts bundle onto chart-free routes (RFIs, Drawings, Submittals,
  // WorkPackages, …). Giving these tiny utils their own chunk breaks that bridge
  // so charts only load where they're actually rendered. Keep BEFORE the charts
  // rule (clsx must land here, not in vendor-charts).
  if (n.includes('/node_modules/clsx/')) return 'vendor-ui-utils'
  if (n.includes('/node_modules/tailwind-merge/')) return 'vendor-ui-utils'
  if (n.includes('/node_modules/class-variance-authority/')) return 'vendor-ui-utils'

  // Charts (recharts + transitive deps)
  if (n.includes('/node_modules/recharts/')) return 'vendor-charts'
  if (n.includes('/node_modules/d3-')) return 'vendor-charts'
  if (n.includes('/node_modules/decimal.js-light/')) return 'vendor-charts'
  if (n.includes('/node_modules/react-smooth/')) return 'vendor-charts'

  // Core framework
  if (n.includes('/node_modules/@supabase/')) return 'vendor-supabase'
  if (n.includes('/node_modules/react-router')) return 'vendor-react-router'
  if (n.includes('/node_modules/react-dom/')) return 'vendor-react'
  if (n.includes('/node_modules/react/')) return 'vendor-react'
  if (n.includes('/node_modules/scheduler/')) return 'vendor-react'
  if (n.includes('/node_modules/@tanstack/react-query/')) return 'vendor-react-query'

  // Radix UI primitives
  if (n.includes('/node_modules/@radix-ui/')) return 'vendor-radix'

  return undefined
}

export default defineConfig({
  logLevel: 'info',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    copyWebIfcWasm(),
    // Must be LAST so it sees the final emitted bundle + source maps. Gated on
    // the auth token; uploads are best-effort (errorHandler swallows failures)
    // so a misconfigured token/slug can never fail a production deploy.
    ...(enableSentrySourceMaps
      ? [sentryVitePlugin({
          // org/project slugs are public identifiers (they appear in the DSN /
          // Sentry URLs, not secrets), so default to the known values; the
          // SENTRY_ORG / SENTRY_PROJECT env vars override if ever needed. Only
          // the auth token must be supplied as a (Vercel) build secret.
          org: process.env.SENTRY_ORG || 'steelbuild-pro',
          project: process.env.SENTRY_PROJECT || 'javascript-react',
          authToken: sentryAuthToken,
          telemetry: false,
          release: { name: process.env.VITE_APP_VERSION || undefined },
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          errorHandler: (err) => {
            console.warn('[sentry-vite-plugin] source-map upload skipped:', err.message)
          },
        })]
      : []),
  ],
  build: {
    // Emit hidden source maps (no sourceMappingURL comment, so they're not
    // referenced by the served bundle) only when we're going to upload them to
    // Sentry; the plugin deletes the .map files from dist after upload. Without
    // the token, no maps are generated (default).
    sourcemap: enableSentrySourceMaps ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  test: {
    globals: true,
    exclude: [
      'node_modules/**',
      'dist/**',
      '.claude/**',
      'steelbuild-pro/**',
      // Playwright E2E specs (e2e/**) run under `npm run test:e2e`, not Vitest —
      // they import @playwright/test, which would throw under the Vitest runner.
      'e2e/**',
    ],
    // Default environment is `node` — keeps the 488 pure-helper tests
    // fast (no jsdom overhead). Component tests opt into jsdom via a
    // `// @vitest-environment jsdom` pragma at the top of the file.
    environment: 'node',
    setupFiles: ['./vitest.setup.js', './src/setupTests.ts'],
    // Use the worker_threads pool. Threads are terminated forcibly at teardown,
    // so a worker whose event loop is briefly busy never produces the forks
    // pool's "Timeout terminating forks worker" warning (intermittent on slow/
    // contended machines). Component tests here mock all native I/O (supabase,
    // base44) and only use jsdom, which runs cleanly under threads.
    pool: 'threads',
  },
});
