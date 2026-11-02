import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Framework packages only change on framework upgrades, so keeping them in one
// stable chunk lets returning users reuse it across app-only releases.
const FRAMEWORK_PACKAGES = ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler']

const isFrameworkModule = (id) =>
  FRAMEWORK_PACKAGES.some((pkg) => id.replace(/\\/g, '/').includes(`/node_modules/${pkg}/`))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      // Keep authenticated page-view telemetry off until its collection,
      // retention, and Play Data Safety disclosures are explicitly approved.
      analyticsTracker: false,
      visualEditAgent: true
    }),
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep framework code stable across app-only releases so returning
        // users can reuse the browser cache instead of downloading it again.
        // Vite 8 (Rolldown) removed the object form of manualChunks, so the
        // split is expressed as a function over module ids.
        manualChunks(id) {
          return isFrameworkModule(id) ? 'react-vendor' : null
        },
      },
    },
  },
});