import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Locally-trusted certificate for `npm run dev:https` (see README:
// "Testing on a phone"). certs/ is gitignored - it holds a private key.
const certFile = fileURLToPath(new URL('./certs/dev-cert.pem', import.meta.url))
const keyFile = fileURLToPath(new URL('./certs/dev-key.pem', import.meta.url))

function devHttps() {
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    throw new Error(
      'HTTPS dev mode needs a locally-trusted certificate in sagar-ai-web/certs/.\n' +
        'Create it with mkcert (once):\n' +
        '  mkcert -install\n' +
        '  mkcert -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem localhost 127.0.0.1 <your-PC-LAN-IP>\n' +
        'then install mkcert\'s rootCA.pem on the phone - see README "Testing on a phone".',
    )
  }
  return { cert: readFileSync(certFile), key: readFileSync(keyFile) }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    // `--mode https` (npm run dev:https) serves the app over https so a
    // phone gets a secure context - required for microphone access.
    // Every other mode keeps the plain-http desktop workflow unchanged.
    https: mode === 'https' ? devHttps() : undefined,
    proxy: {
      // Used when the page is https: an http:// backend would be blocked
      // as mixed content, so the frontend calls its own origin and Vite
      // forwards /api to the backend on this machine (apiConfig.ts).
      // Ollama is never proxied - only the Sagar backend.
      '/api': {
        target: process.env.SAGAR_API_PROXY_TARGET ?? 'http://127.0.0.1:4000',
      },
    },
  },
}))
