/**
 * ByteDance bigmodel streaming ASR — binary WebSocket frame protocol.
 *
 * Frame layout:
 *   [4 bytes header]
 *   [4 bytes sequence (int32 BE, only when flags bit-0 is set)]
 *   [4 bytes payload size (uint32 BE)]
 *   [N bytes payload (gzip-compressed)]
 *
 * Header bytes:
 *   [0] (protocol_version << 4) | header_size_units   (always 0x11)
 *   [1] (message_type << 4)     | message_flags
 *   [2] (serialization << 4)    | compression
 *   [3] 0x00  (reserved)
 */

import { gzip, ungzip } from 'pako'

// ── constants ────────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = 0x01
const HEADER_SIZE_UNITS = 0x01          // 1 unit = 4 bytes → 4-byte header

// Message types
const FULL_CLIENT_REQUEST  = 0x01       // first frame: JSON config
const AUDIO_ONLY_REQUEST   = 0x02       // subsequent frames: raw PCM
const FULL_SERVER_RESPONSE = 0x09       // server recognition result
const SERVER_ERROR_RESPONSE = 0x0f      // server error

// Sequence flags (lower nibble of header byte 1)
const POS_SEQUENCE      = 0x01          // has sequence, not last
const NEG_SEQUENCE      = 0x02          // is last, no sequence field
const NEG_WITH_SEQUENCE = 0x03          // is last, sequence field present (negative value)

// Serialization (upper nibble of header byte 2)
const JSON_SERIAL = 0x01

// Compression (lower nibble of header byte 2)
const GZIP_COMPRESSION = 0x01

// ── internal helpers ─────────────────────────────────────────────────────────

function makeHeaderByte1(msgType: number, flags: number): number {
  return ((msgType & 0x0f) << 4) | (flags & 0x0f)
}

/**
 * Assemble a complete binary frame buffer.
 *
 * @param msgType     - one of the message type constants above
 * @param flags       - sequence flags
 * @param payload     - already-compressed payload bytes
 * @param sequence    - sequence number (included only when flags have bit-0 set)
 */
function buildFrame(
  msgType: number,
  flags: number,
  payload: Uint8Array,
  sequence?: number,
): ArrayBuffer {
  const hasSeq = (flags & 0x01) !== 0
  const totalLen = 4 + (hasSeq ? 4 : 0) + 4 + payload.length
  const buf = new ArrayBuffer(totalLen)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // Header
  u8[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE_UNITS
  u8[1] = makeHeaderByte1(msgType, flags)
  u8[2] = (JSON_SERIAL << 4) | GZIP_COMPRESSION
  u8[3] = 0x00

  let off = 4
  if (hasSeq) {
    view.setInt32(off, sequence ?? 1, false)   // big-endian signed
    off += 4
  }

  view.setUint32(off, payload.length, false)   // big-endian unsigned
  off += 4

  u8.set(payload, off)
  return buf
}

// ── public API ───────────────────────────────────────────────────────────────

export interface ASRConfig {
  uid: string
  rate?: number
  enablePunc?: boolean
}

/**
 * Build the initial FULL_CLIENT_REQUEST frame (gzip-compressed JSON config).
 */
export function buildFullClientRequest(cfg: ASRConfig): ArrayBuffer {
  const json = {
    user: { uid: cfg.uid },
    audio: {
      format: 'pcm',
      rate: cfg.rate ?? 16000,
      bits: 16,
      channel: 1,
      codec: 'raw',
    },
    request: {
      model_name: 'bigmodel',
      enable_punc: cfg.enablePunc ?? true,
    },
  }
  const payload = gzip(new TextEncoder().encode(JSON.stringify(json)))
  return buildFrame(FULL_CLIENT_REQUEST, POS_SEQUENCE, payload, 1)
}

/**
 * Build an AUDIO_ONLY_REQUEST frame.
 *
 * @param pcm      - Int16 raw PCM samples
 * @param sequence - monotonically increasing frame index (starting from 2)
 * @param isLast   - true for the final audio frame (signals end-of-stream)
 */
export function buildAudioFrame(
  pcm: Int16Array,
  sequence: number,
  isLast: boolean,
): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const payload = gzip(pcmBytes)
  const flags = isLast ? NEG_WITH_SEQUENCE : POS_SEQUENCE
  // Negative sequence on the last frame signals EOF to the server
  return buildFrame(AUDIO_ONLY_REQUEST, flags, payload, isLast ? -sequence : sequence)
}

export interface ParsedServerFrame {
  isLast: boolean
  text: string
  errorCode?: number
  errorMessage?: string
}

/**
 * Parse a binary server response frame into a plain object.
 */
export function parseServerFrame(data: ArrayBuffer): ParsedServerFrame {
  const u8 = new Uint8Array(data)
  const view = new DataView(data)

  // Header byte 0: (version << 4) | header_size_units
  const headerSizeBytes = (u8[0] & 0x0f) * 4   // 1 unit = 4 bytes

  // Header byte 1: (msgType << 4) | flags
  const msgType = (u8[1] >> 4) & 0x0f
  const flags   = u8[1] & 0x0f

  // Header byte 2: (serial << 4) | compression
  const serial      = (u8[2] >> 4) & 0x0f
  const compression = u8[2] & 0x0f

  const hasSeq = (flags & 0x01) !== 0
  const isLast = (flags & 0x02) !== 0

  let off = headerSizeBytes
  if (hasSeq) off += 4                          // skip sequence number

  if (off + 4 > u8.length) return { isLast, text: '' }

  const payloadSize = view.getUint32(off, false)
  off += 4

  let payload = u8.slice(off, off + payloadSize)

  // Decompress
  if (compression === GZIP_COMPRESSION) {
    try {
      payload = ungzip(payload)
    } catch (e) {
      console.error('[ASR] gzip decompress failed', e)
      return { isLast, text: '', errorMessage: 'gzip decompress failed' }
    }
  }

  // Handle server error frame
  if (msgType === SERVER_ERROR_RESPONSE) {
    const msg = new TextDecoder().decode(payload)
    console.error('[ASR] server error frame:', msg)
    return { isLast: true, text: '', errorMessage: msg }
  }

  // Deserialize JSON
  if (msgType === FULL_SERVER_RESPONSE && serial === JSON_SERIAL) {
    try {
      const json = JSON.parse(new TextDecoder().decode(payload)) as {
        code?: number
        message?: string
        result?: {
          text?: string
          utterances?: Array<{ text: string; definite?: boolean }>
        }
      }

      console.debug('[ASR] server frame', json)

      if (json.code !== undefined && json.code !== 0) {
        return {
          isLast: true,
          text: '',
          errorCode: json.code,
          errorMessage: json.message ?? `error code ${json.code}`,
        }
      }

      const text =
        json.result?.utterances?.map((u) => u.text).join('') ??
        json.result?.text ??
        ''
      return { isLast, text }
    } catch (e) {
      console.error('[ASR] JSON parse failed', e)
      return { isLast, text: '', errorMessage: 'JSON parse failed' }
    }
  }

  return { isLast, text: '' }
}
