import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function vendorChunk(id) {
  const n = id.replace(/\\/g, '/')
  if (!n.includes('/node_modules/')) return undefined

  // BIM / 3D
  if (n.includes('/node_modules/web-ifc/')) return 'vendor-bim-ifc'
  if (n.includes('/node_modules/@thatopen/')) return 'vendor-bim-thatopen'
  if (n.includes('/node_modules/camera-controls/')) return 'vendor-three-controls'
  if (n.includes('/node_modules/three/build/three.webgpu')) return 'vendor-three-webgpu'
  if (n.includes('/node_modules/three/build/three.tsl')) return 'vendor-three-webgpu'
  if (n.includes('/node_modules/three/examples/')) return 'vendor-three-examples'
  if (n.includes('/node_modules/three/')) return 'vendor-three-core'

  // Heavy export libs
  if (n.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdf'
  if (n.includes('/node_modules/jspdf/')) return 'vendor-pdf'
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
  },
});
