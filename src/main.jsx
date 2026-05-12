import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { installDateOnlyShim } from '@/lib/dateOnly'
import { logError } from '@/lib/telemetry'
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
