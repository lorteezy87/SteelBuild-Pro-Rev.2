import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { installDateOnlyShim } from '@/lib/dateOnly'
import { logError } from '@/lib/telemetry'
import { preloadHeavyAssets } from '@/lib/preload'
import '@/globals.css'

installDateOnlyShim()

// Capture errors that escape React's render tree (async work, promise
// rejections, third-party scripts) so they share a logging path with the
// ErrorBoundaries.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    logError(event.error || event.message, { source: 'window.error', filename: event.filename, lineno: event.lineno })
  })
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason, { source: 'unhandledrejection' })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Warm heavy viewer assets (pdfjs worker, web-ifc wasm) once the main bundle
// is rendered. Runs on requestIdleCallback so it never competes with the
// initial paint or any user-driven navigation.
preloadHeavyAssets()
