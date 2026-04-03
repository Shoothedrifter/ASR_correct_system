/**
 * Offline mock ASR that streams one character every 200ms.
 * Activated when VITE_USE_MOCK=true.
 */
export function createMockASR(
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
): { start: () => void; stop: () => void } {
  const MOCK_TEXT = '今天天气很好，我们一起去公园散步吧。'
  let timer: ReturnType<typeof setInterval> | null = null
  let index = 0
  let accumulated = ''

  function start() {
    index = 0
    accumulated = ''
    timer = setInterval(() => {
      if (index >= MOCK_TEXT.length) {
        if (timer !== null) clearInterval(timer)
        onFinal(accumulated)
        return
      }
      accumulated += MOCK_TEXT[index]
      index++
      onPartial(accumulated)
    }, 200)
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    onFinal(accumulated)
  }

  return { start, stop }
}
