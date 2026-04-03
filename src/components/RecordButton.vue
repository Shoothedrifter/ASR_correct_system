<template>
  <div class="record-control">
    <button
      class="record-btn"
      :class="{ recording: isRecording, disabled: disabled }"
      :disabled="disabled"
      @click="handleClick"
      :aria-label="isRecording ? '停止录音' : '开始录音'"
    >
      <span class="indicator" :class="statusClass" />
      <span class="label">{{ buttonLabel }}</span>
    </button>
    <p class="status-text">{{ statusMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ASRStatus } from '../types'

const props = defineProps<{
  isRecording: boolean
  status: ASRStatus
}>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'stop'): void
}>()

const disabled = computed(
  () => props.status === 'connecting' || props.status === 'processing',
)

const buttonLabel = computed(() => {
  if (props.status === 'connecting') return '连接中…'
  if (props.status === 'processing') return '处理中…'
  return props.isRecording ? '停止录音' : '开始录音'
})

const statusClass = computed(() => ({
  idle:   props.status === 'idle' || props.status === 'done',
  active: props.status === 'recording',
  busy:   props.status === 'connecting' || props.status === 'processing',
  error:  props.status === 'error',
}))

const statusMessage = computed(() => {
  const map: Record<ASRStatus, string> = {
    idle:       '点击按钮开始录音',
    connecting: '正在连接 ASR 服务…',
    recording:  '录音中，点击停止',
    processing: '正在等待最终识别结果…',
    done:       '识别完成',
    error:      '连接失败，请检查凭证或网络',
  }
  return map[props.status]
})

function handleClick() {
  if (props.isRecording) emit('stop')
  else emit('start')
}
</script>

<style scoped>
.record-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
}

.record-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 2.2rem;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #fff;
  box-shadow: 0 4px 18px rgba(37, 99, 235, 0.38);
  transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
}

.record-btn:hover:not(.disabled) {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  box-shadow: 0 6px 22px rgba(37, 99, 235, 0.48);
  transform: translateY(-1px);
}

.record-btn:active:not(.disabled) {
  transform: translateY(0);
  box-shadow: 0 3px 12px rgba(37, 99, 235, 0.3);
}

.record-btn.recording {
  background: linear-gradient(135deg, #dc2626, #ef4444);
  box-shadow: 0 4px 18px rgba(220, 38, 38, 0.38);
}

.record-btn.recording:hover {
  background: linear-gradient(135deg, #b91c1c, #dc2626);
  box-shadow: 0 6px 22px rgba(220, 38, 38, 0.48);
}

.record-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  transition: background 0.2s;
}

.indicator.active {
  background: #ffffff;
  animation: pulse 1s infinite;
}

.indicator.busy {
  background: #fde68a;
}

.indicator.error {
  background: #fca5a5;
}

@keyframes pulse {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.8); }
}

.status-text {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0;
  font-weight: 500;
}
</style>
