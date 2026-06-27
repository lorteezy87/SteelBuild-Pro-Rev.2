import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
