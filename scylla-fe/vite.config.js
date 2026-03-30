import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Server-side only — never exposed to the browser bundle.
// Set BACKEND_URL in your shell or .env.local (without the VITE_ prefix).
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
})
