import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { installDateOnlyShim } from '@/lib/dateOnly'
import '@/globals.css'
import '@/index.css'

installDateOnlyShim()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
