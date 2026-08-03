import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initTelemetry, trackEvent } from '@/lib/telemetry'
import { markChunksLoaded, installChunkErrorRecovery } from '@/lib/lazyWithRetry'

// The bundle loaded, so clear any stale-chunk reload guard and start watching
// for a future republish mismatch.
markChunksLoaded()
installChunkErrorRecovery()

// Global crash capture (async errors, event handlers) before React mounts.
initTelemetry()
trackEvent('app_open')

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
