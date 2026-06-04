import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

  // BIM / 3D
  if (n.includes('/node_modules/web-ifc/')) return 'vendor-bim-ifc'
  if (n.includes('/node_modules/@thatopen/')) return 'vendor-bim-thatopen'
  if (n.includes('/node_modules/camera-controls/')) return 'vendor-three-controls'
  if (n.includes('/node_modules/three/build/three.webgpu')) return 'vendor-three-webgpu'
  if (n.includes('/node_modules/three/build/three.tsl')) return 'vendor-three-webgpu'
  if (n.includes('/node_modules/three/examples/')) return 'vendor-three-examples'
  if (n.includes('/node_modules/three/')) return 'vendor-three-core'

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
    wasm(),
    topLevelAwait(),
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
  optimizeDeps: {
    // Exclude web-ifc from Vite's dependency pre-bundling to avoid
    // circular-reference errors ("Cannot access 'Ct' before initialization")
    exclude: ['web-ifc'],
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
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
