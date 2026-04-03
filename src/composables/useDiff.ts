import { ref, computed, readonly } from 'vue'
import type { DiffEntry } from '../types'
import { computeDiff } from '../utils/diff'

export function useDiff() {
  const diffEntries = ref<DiffEntry[]>([])

  const errorCount = computed(() => diffEntries.value.length)

  function runDiff(original: string, edited: string) {
    diffEntries.value = computeDiff(original, edited)
  }

  return {
    diffEntries: readonly(diffEntries),
    errorCount,
    runDiff,
  }
}
