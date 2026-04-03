import { ref, readonly } from 'vue'
import type { ASRStatus } from '../types'
import { generateUUID } from '../utils/uuid'
import { buildFullClientRequest, buildAudioFrame, parseServerFrame } from '../utils/protocol'
import { createMockASR } from '../mocks/mockASR'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
// Dev:  VITE_WS_BASE is empty → relative path '/ws/asr' → Vite proxy injects AK/SK
// Prod: VITE_WS_BASE = 'wss://your-backend.onrender.com' → full WSS URL
const WS_PROXY_PATH = `${import.meta.env.VITE_WS_BASE ?? ''}/ws/asr`

export function useDoubaoASR() {
  const status = ref<ASRStatus>('idle')
  const partialText = ref('')
  const finalText = ref('')

  let ws: WebSocket | null = null
  let mock: ReturnType<typeof createMockASR> | null = null
  let connectId = ''
  let audioSeq = 2          // sequence starts at 2; config frame uses 1
  let lastPcm: Int16Array | null = null   // buffer the most recent frame for EOF flush

  function connect() {
    if (USE_MOCK) {
      partialText.value = ''
      finalText.value = ''
      status.value = 'recording'
      mock = createMockASR(
        (text) => { partialText.value = text },
        (text) => { finalText.value = text; status.value = 'done' },
      )
      mock.start()
      return
    }

    status.value = 'connecting'
    // Reset per-session state so previous results don't bleed into the new session
    partialText.value = ''
    finalText.value = ''
    connectId = generateUUID()
    audioSeq = 2
    lastPcm = null

    // Connect through the Vite dev-server proxy; auth headers are added there.
    const url = `${WS_PROXY_PATH}?X-Api-Connect-Id=${encodeURIComponent(connectId)}`
    console.info('[ASR] connecting via proxy …', url)

    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      console.info('[ASR] connected, sending config frame')
      status.value = 'recording'
      const configFrame = buildFullClientRequest({ uid: connectId })
      ws!.send(configFrame)
    }

    ws.onmessage = (event: MessageEvent) => {
      const raw = event.data as ArrayBuffer
      const frame = parseServerFrame(raw)

      if (frame.errorMessage) {
        console.error('[ASR] error from server:', frame.errorCode, frame.errorMessage)
        status.value = 'error'
        return
      }

      if (frame.isLast) {
        finalText.value = frame.text
        status.value = 'done'
      } else if (frame.text) {
        partialText.value = frame.text
      }
    }

    ws.onerror = (event) => {
      console.error('[ASR] WebSocket error', event)
      status.value = 'error'
    }

    ws.onclose = (event) => {
      console.info(`[ASR] closed — code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`)
      if (status.value !== 'done' && status.value !== 'error') {
        // Unexpected close (e.g. auth rejected before onopen)
        if (event.code === 1008 || event.code === 4001 || event.code === 4003) {
          status.value = 'error'
        } else {
          status.value = 'done'
        }
      }
    }
  }

  function sendPCM(pcm: Int16Array) {
    if (USE_MOCK || ws?.readyState !== WebSocket.OPEN) return
    // Hold onto this frame; it will be sent as a regular frame and the
    // NEXT frame will replace it. On disconnect() the buffered frame is
    // flushed as the final (EOF) frame.
    if (lastPcm !== null) {
      // Send the previously buffered frame as a regular (non-last) frame
      ws.send(buildAudioFrame(lastPcm, audioSeq, false))
      audioSeq++
    }
    lastPcm = pcm
  }

  function disconnect() {
    if (USE_MOCK) {
      mock?.stop()
      mock = null
      return
    }

    if (ws?.readyState === WebSocket.OPEN) {
      // Flush the last PCM frame with the EOF (NEG_WITH_SEQUENCE) flag
      const eofFrame = lastPcm
        ? buildAudioFrame(lastPcm, audioSeq, true)
        : buildAudioFrame(new Int16Array(0), audioSeq, true)
      ws.send(eofFrame)
      lastPcm = null
      // Do not close immediately — wait for the server's final is_last response
      if (status.value === 'recording') status.value = 'processing'
    } else if (ws) {
      ws.close()
      ws = null
    }
  }

  return {
    status: readonly(status),
    partialText: readonly(partialText),
    finalText: readonly(finalText),
    connect,
    disconnect,
    sendPCM,
  }
}
