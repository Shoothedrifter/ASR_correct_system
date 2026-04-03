<template>
  <div class="app">
    <header class="app-header">
      <div class="app-title-group">
        <div class="app-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="8"  y1="22" x2="16" y2="22"/>
          </svg>
        </div>
        <h1 class="app-title">ASR 校对标注系统</h1>
      </div>
      <span v-if="isMock" class="mock-badge">Mock 模式</span>
    </header>

    <main class="app-content">
      <!-- Empty state: no sessions yet and not recording -->
      <div v-if="sessions.length === 0 && isIdle" class="empty-state">
        <div class="empty-mic">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="8"  y1="22" x2="16" y2="22"/>
          </svg>
        </div>
        <p class="empty-hint">点击下方按钮开始录音</p>
        <p v-if="status === 'error'" class="error-hint">连接失败，请检查凭证或网络</p>
      </div>

      <!-- All completed sessions (oldest → newest) -->
      <RecordingSession
        v-for="s in sessions"
        :key="s.id"
        :originalText="s.finalText"
        :ref="el => { if (el) sessionRefs[s.id] = el as HTMLElement }"
      />

      <!-- Active recording: stream card on the right -->
      <div v-if="isStreaming" class="conversation-grid">
        <div class="stream-card">
          <div class="stream-card-inner">
            <span v-if="partialText" class="stream-text">{{ partialText }}</span>
            <span v-else class="stream-placeholder">正在等待识别结果…</span>
          </div>
        </div>
      </div>
    </main>

    <footer class="app-footer">
      <RecordButton
        :isRecording="isRecording"
        :status="status"
        @start="handleStart"
        @stop="handleStop"
      />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import RecordButton from './components/RecordButton.vue'
import RecordingSession from './components/RecordingSession.vue'
import { useAudioRecorder } from './composables/useAudioRecorder'
import { useDoubaoASR } from './composables/useDoubaoASR'

const isMock = import.meta.env.VITE_USE_MOCK === 'true'

const { isRecording, start: startRecorder, stop: stopRecorder, onPCMFrame } = useAudioRecorder()
const { status, partialText, finalText, connect, disconnect, sendPCM } = useDoubaoASR()

interface SessionRecord {
  id: number
  finalText: string
}

const sessions    = ref<SessionRecord[]>([])
const sessionRefs = ref<Record<number, HTMLElement>>({})

const isIdle      = computed(() => status.value === 'idle' || status.value === 'error')
const isStreaming  = computed(() =>
  status.value === 'connecting' ||
  status.value === 'recording'  ||
  status.value === 'processing',
)

// When a recording completes, save it as a new session and scroll into view
watch(finalText, async (text) => {
  if (!text) return
  const id = Date.now()
  sessions.value.push({ id, finalText: text })
  await nextTick()
  // Smooth-scroll to the newly added session
  const el = sessionRefs.value[id]
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

onPCMFrame((pcm) => sendPCM(pcm))

async function handleStart() {
  connect()
  if (import.meta.env.VITE_USE_MOCK !== 'true') {
    await startRecorder()
  }
}

function handleStop() {
  stopRecorder()
  disconnect()
}
</script>

<style>
@import './assets/main.css';
</style>

<style scoped>
/* ── Shell ──────────────────────────────────────── */
.app {
  min-height: 100vh;
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
}

/* ── Header ─────────────────────────────────────── */
.app-header {
  padding: 1.6rem 0 1.2rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-title-group {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.app-logo {
  width: 38px;
  height: 38px;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}

.app-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.mock-badge {
  padding: 0.2rem 0.75rem;
  background: rgba(254, 252, 191, 0.9);
  color: #744210;
  border: 1px solid #f6e05e;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* ── Content area ───────────────────────────────── */
.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-bottom: 1rem;
}

/* ── Footer ─────────────────────────────────────── */
.app-footer {
  flex-shrink: 0;
  padding: 1.1rem 0 1.4rem;
  display: flex;
  justify-content: center;
  position: sticky;
  bottom: 0;
  background: rgba(240, 249, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(191, 219, 254, 0.6);
}

/* ── Empty state ────────────────────────────────── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 300px;
}

.empty-mic {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.18);
}

.empty-hint {
  font-size: 1.05rem;
  color: #64748b;
  margin: 0;
  font-weight: 500;
}

.error-hint {
  font-size: 0.88rem;
  color: #dc2626;
  margin: 0;
}

/* ── Active recording: stream card on right ─────── */
.conversation-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 1.5rem;
  padding: 0.75rem 0 0.5rem;
}

.stream-card {
  grid-column: 2;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  border-radius: 1rem;
  padding: 2px;
  box-shadow: 0 6px 28px rgba(29, 78, 216, 0.35);
}

.stream-card-inner {
  background: linear-gradient(135deg, #1e40af, #2563eb);
  border-radius: calc(1rem - 2px);
  padding: 1.2rem 1.4rem;
  min-height: 80px;
}

.stream-text {
  font-size: 1.05rem;
  line-height: 1.8;
  color: #ffffff;
}

.stream-placeholder {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.55);
}
</style>
