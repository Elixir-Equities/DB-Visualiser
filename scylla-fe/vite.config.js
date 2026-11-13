import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No dev proxy: the app now talks to an absolute base URL chosen at runtime by
// src/api/apiClient.js — the gateway when deployed, or VITE_LOCAL_API_URL
// directly in local mode. Nothing requests a relative /api path any more.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The CQL editor (CodeMirror + Lezer) is the bulk of the bundle and
        // changes far less often than app code, so ship it as its own cacheable chunk.
        manualChunks(id) {
          if (/node_modules\/(@codemirror|@lezer|style-mod|w3c-keyname|crelt)\//.test(id)) return 'editor'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
})
