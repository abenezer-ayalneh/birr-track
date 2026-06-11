import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Expose on the LAN so the app can be tunneled into Telegram during development.
    host: true,
  },
})
