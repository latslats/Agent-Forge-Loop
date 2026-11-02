import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Hono API (apps/server) listens on 8787; the dev server forwards those paths to it.
const API_TARGET = 'http://localhost:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': API_TARGET,
      '/hooks': API_TARGET,
    },
  },
})
