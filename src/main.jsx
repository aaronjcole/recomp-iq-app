import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initTelemetry, trackEvent } from '@/lib/telemetry'
import { installChunkErrorRecovery } from '@/lib/lazyWithRetry'

// Watch for a stale-chunk mismatch after a republish. The reload guard is
// cleared only when a lazy chunk loads (lazyWithRetry), not here: clearing it on
// every entry run let a persistently failing chunk reload in a loop.
installChunkErrorRecovery()

// Global crash capture (async errors, event handlers) before React mounts.
initTelemetry()
trackEvent('app_open')

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
