// ASR WebSocket proxy server
// Injects ByteDance credentials so they never appear in the browser.
//
// Required env vars (set in Render/Railway dashboard):
//   DOUBAO_APP_KEY      — ByteDance App Key
//   DOUBAO_ACCESS_KEY   — ByteDance Access Key
//   PORT                — (optional) defaults to 3000

'use strict'
const http      = require('http')
const WebSocket = require('ws')
const { randomUUID } = require('crypto')

const APP_KEY = process.env.DOUBAO_APP_KEY
const AK      = process.env.DOUBAO_ACCESS_KEY
const PORT    = process.env.PORT || 3000

if (!APP_KEY || !AK) {
  console.error('[proxy] DOUBAO_APP_KEY and DOUBAO_ACCESS_KEY must be set')
  process.exit(1)
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ASR proxy OK\n')
})

const wss = new WebSocket.Server({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  // Only handle /ws/asr
  if (!req.url?.startsWith('/ws/asr')) {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (client) => {
    const url       = new URL(req.url, 'http://localhost')
    const connectId = url.searchParams.get('X-Api-Connect-Id') ?? randomUUID()

    console.info(`[proxy] new connection  connectId=${connectId}`)

    // Open upstream connection to ByteDance with injected credentials
    const upstream = new WebSocket(
      'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
      {
        headers: {
          'X-Api-App-Key':     APP_KEY,
          'X-Api-Access-Key':  AK,
          'X-Api-Resource-Id': 'volc.bigasr.sauc.duration',
          'X-Api-Connect-Id':  connectId,
        },
      }
    )

    // Register the client message listener immediately — do NOT wait for upstream.
    // The browser sends the config frame as soon as its WebSocket opens, which is
    // before the upstream TLS handshake completes.  Registering inside upstream
    // 'open' would silently drop that first frame and ByteDance would never
    // receive the required init payload ("decode ws" error / close 1006).
    const earlyQueue = []
    client.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary })
      } else {
        earlyQueue.push({ data, isBinary })
      }
    })

    upstream.on('open', () => {
      // Flush frames that arrived while upstream was still connecting
      for (const msg of earlyQueue) {
        upstream.send(msg.data, { binary: msg.isBinary })
      }
      earlyQueue.length = 0
    })

    // Forward frames from ByteDance → browser
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary })
      }
    })

    upstream.on('close', (code, reason) => {
      console.info(`[proxy] upstream closed  code=${code}`)
      if (client.readyState === WebSocket.OPEN) {
        // 1004 / 1005 / 1006 are reserved codes that cannot be sent in a close frame.
        // Substitute 1011 (internal error) so ws.close() doesn't throw and crash the process.
        const UNSENDABLE = new Set([1004, 1005, 1006])
        const safeCode = (!UNSENDABLE.has(code) && code >= 1000) ? code : 1011
        client.close(safeCode, reason)
      }
    })

    upstream.on('error', (err) => {
      console.error('[proxy] upstream error:', err.message)
      if (client.readyState === WebSocket.OPEN) client.close(1011)
    })

    client.on('close', () => {
      if (upstream.readyState === WebSocket.OPEN) upstream.close()
    })

    client.on('error', (err) => {
      console.error('[proxy] client error:', err.message)
      if (upstream.readyState === WebSocket.OPEN) upstream.close()
    })
  })
})

server.listen(PORT, () => {
  console.info(`[proxy] listening on port ${PORT}`)
})
