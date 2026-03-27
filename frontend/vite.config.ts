import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy API calls to the Go backend during development
      '/auth': 'http://localhost:8080',
      '/plans': 'http://localhost:8080',
      '/ai': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
})
