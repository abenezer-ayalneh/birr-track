import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow the tunnel hostname through Vite 6's host check.
    allowedHosts: ['local-app.abenezer-ayalneh.dev'],
    // Route HMR over the public HTTPS tunnel (wss on 443) instead of ws://localhost.
    hmr: {
      host: 'local-app.abenezer-ayalneh.dev',
      protocol: 'wss',
      clientPort: 443,
    },
  },
})
