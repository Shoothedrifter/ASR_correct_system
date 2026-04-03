/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { randomUUID } from 'node:crypto'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env so credentials are available at config time (server-side only)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],

    // GitHub Pages project repos live at /repo-name/; set via CI env var.
    // Local dev and root-level deployments leave this as '/'.
    base: process.env.VITE_BASE_URL ?? '/',

    server: {
      proxy: {
        // Browser connects to ws://localhost:5173/ws/asr?X-Api-Connect-Id=<uuid>
        // Vite injects the real auth headers before forwarding to ByteDance.
        // Credentials never appear in browser JS or network tab.
        '/ws/asr': {
          target: 'wss://openspeech.bytedance.com',
          ws: true,
          changeOrigin: true,
          // Drop /ws/asr prefix → /api/v3/sauc/bigmodel (query string is stripped)
          rewrite: () => '/api/v3/sauc/bigmodel',
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq, req) => {
              // Extract the Connect-Id the browser generated
              const url = new URL(req.url ?? '/', 'http://localhost')
              const connectId =
                url.searchParams.get('X-Api-Connect-Id') ?? randomUUID()

              // Inject required auth headers onto the upstream request
              proxyReq.setHeader('X-Api-App-Key', env.VITE_DOUBAO_APP_KEY ?? '')
              proxyReq.setHeader('X-Api-Access-Key', env.VITE_DOUBAO_ACCESS_KEY ?? '')
              proxyReq.setHeader('X-Api-Resource-Id', 'volc.bigasr.sauc.duration')
              proxyReq.setHeader('X-Api-Connect-Id', connectId)
            })

            proxy.on('error', (err) => {
              console.error('[ASR proxy]', err.message)
            })
          },
        },
      },
    },

    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
    },
  }
})
