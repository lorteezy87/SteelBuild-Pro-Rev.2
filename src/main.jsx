// Sentry must initialise before any other app code — keep this import FIRST.
import './instrument'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { installDateOnlyShim } from '@/lib/dateOnly'
import { logError } from '@/lib/telemetry'
import '@/globals.css'
import "@/styles/desktop.css"

installDateOnlyShim()

function installWebManifest() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const { hostname } = window.location
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const isProductionAlias = hostname === 'steelbuild-pro.vercel.app'
  const isProtectedVercelDeployment = hostname.endsWith('.vercel.app') && !isProductionAlias

  if (!isLocal && isProtectedVercelDeployment) return
  if (document.querySelector('link[rel="manifest"]')) return

  const link = document.createElement('link')
  link.rel = 'manifest'
  link.href = '/manifest.json'
  document.head.appendChild(link)
}

installWebManifest()

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
