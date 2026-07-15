import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend origin for the youtube-downloader-api. Override with BACKEND_URL.
const backend = process.env.BACKEND_URL ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API + file downloads to the backend so the browser talks to a
    // single origin in dev — no CORS needed.
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/downloads': { target: backend, changeOrigin: true },
    },
  },
})
