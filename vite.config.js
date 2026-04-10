import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  logLevel: 'error',
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // web-ifc-three@0.0.125 imports the legacy `mergeBufferGeometries` name
      // from BufferGeometryUtils, which three@0.154+ renamed to
      // `mergeGeometries`. Redirect the bare specifier (no .js) to a shim
      // that re-exports the real module and adds the legacy alias. The shim
      // imports the real path with the `.js` suffix so it escapes this alias.
      {
        find: /^three\/examples\/jsm\/utils\/BufferGeometryUtils$/,
        replacement: path.resolve(__dirname, './src/lib/bufferGeometryUtilsShim.js'),
      },
    ],
  },
  plugins: [
    react(),
  ],
  optimizeDeps: {
    // web-ifc uses Emscripten-generated WASM glue code that breaks if Vite's
    // dependency pre-bundler rewrites it.  Exclude both packages so the
    // original module structure is preserved at build time.
    exclude: ['web-ifc', 'web-ifc-three'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
