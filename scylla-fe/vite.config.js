import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No dev proxy: the app now talks to an absolute base URL chosen at runtime by
// src/api/apiClient.js — the gateway when deployed, or VITE_LOCAL_API_URL
// directly in local mode. Nothing requests a relative /api path any more.
export default defineConfig({
  plugins: [react()],
})
