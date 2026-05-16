import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function vendorChunk(id) {
  const normalizedId = id.replace(/\\/g, '/')
  if (!normalizedId.includes('/node_modules/')) return undefined

  if (normalizedId.includes('/node_modules/web-ifc/')) return 'vendor-bim-ifc'
  if (normalizedId.includes('/node_modules/@thatopen/')) return 'vendor-bim-thatopen'
  if (normalizedId.includes('/node_modules/camera-controls/')) return 'vendor-three-controls'
  if (normalizedId.includes('/node_modules/three/build/three.webgpu')) return 'vendor-three-webgpu'
  if (normalizedId.includes('/node_modules/three/build/three.tsl')) return 'vendor-three-webgpu'
  if (normalizedId.includes('/node_modules/three/examples/')) return 'vendor-three-examples'
  if (normalizedId.includes('/node_modules/three/')) return 'vendor-three-core'

  if (normalizedId.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdf'
  if (normalizedId.includes('/node_modules/xlsx/')) return 'vendor-xlsx'

  if (normalizedId.includes('/node_modules/recharts/')) return 'vendor-charts'
  if (normalizedId.includes('/node_modules/d3-')) return 'vendor-charts'
  if (normalizedId.includes('/node_modules/decimal.js-light/')) return 'vendor-charts'
  if (normalizedId.includes('/node_modules/react-smooth/')) return 'vendor-charts'

  if (normalizedId.includes('/node_modules/@supabase/')) return 'vendor-supabase'
  if (normalizedId.includes('/node_modules/react-router')) return 'vendor-react-router'
  if (normalizedId.includes('/node_modules/react-dom/')) return 'vendor-react'
  if (normalizedId.includes('/node_modules/react/')) return 'vendor-react'
  if (normalizedId.includes('/node_modules/scheduler/')) return 'vendor-react'
  if (normalizedId.includes('/node_modules/@tanstack/react-query/')) return 'vendor-react-query'

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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-accordion',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-toast',
          ],
          'vendor-charts': ['recharts'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-pdf': ['jspdf', 'pdfjs-dist'],
          'vendor-xlsx': ['xlsx'],
        },
      },
    },
  },
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
