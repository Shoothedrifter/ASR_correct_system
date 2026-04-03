import { ref, readonly } from 'vue'
import { float32ToInt16, downsample } from '../utils/audio'

const TARGET_SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096

type PCMCallback = (pcm: Int16Array) => void

export function useAudioRecorder() {
  const isRecording = ref(false)
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  // TODO: migrate to AudioWorkletNode when browser support is universal
  let scriptProcessor: ScriptProcessorNode | null = null
  let pcmCallback: PCMCallback | null = null

  function onPCMFrame(cb: PCMCallback) {
    pcmCallback = cb
  }

  async function start() {
    if (isRecording.value) return

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

    // Request 16kHz directly; browser/hardware may adjust
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    const source = audioContext.createMediaStreamSource(mediaStream)
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)

    scriptProcessor.onaudioprocess = (event) => {
      const float32 = event.inputBuffer.getChannelData(0)
      const actualRate = audioContext!.sampleRate
      const resampled =
        actualRate !== TARGET_SAMPLE_RATE
          ? downsample(float32, actualRate, TARGET_SAMPLE_RATE)
          : float32
      const int16 = float32ToInt16(resampled)
      pcmCallback?.(int16)
    }

    source.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)
    isRecording.value = true
  }

  function stop() {
    if (!isRecording.value) return
    scriptProcessor?.disconnect()
    scriptProcessor = null
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    audioContext?.close()
    audioContext = null
    isRecording.value = false
  }

  return {
    isRecording: readonly(isRecording),
    start,
    stop,
    onPCMFrame,
  }
}
