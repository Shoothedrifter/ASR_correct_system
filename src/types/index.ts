export type DiffType = '错词' | '漏字' | '多字' | '标点错误'

export interface DiffEntry {
  orig: string
  edit: string
  origIdx: number
  type: DiffType
}

export type ASRStatus = 'idle' | 'connecting' | 'recording' | 'processing' | 'done' | 'error'

export interface UseAudioRecorderReturn {
  isRecording: Readonly<Ref<boolean>>
  start: () => Promise<void>
  stop: () => void
  onPCMFrame: (cb: (pcm: Int16Array) => void) => void
}

export interface UseDoubaoASRReturn {
  status: Readonly<Ref<ASRStatus>>
  partialText: Readonly<Ref<string>>
  finalText: Readonly<Ref<string>>
  connect: () => void
  disconnect: () => void
  sendPCM: (pcm: Int16Array) => void
}

export interface UseDiffReturn {
  diffEntries: Readonly<Ref<DiffEntry[]>>
  errorCount: ComputedRef<number>
  runDiff: (original: string, edited: string) => void
}

// Re-export Vue types used in return type declarations above
import type { Ref, ComputedRef } from 'vue'
