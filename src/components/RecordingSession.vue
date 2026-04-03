<template>
  <!-- Same two-column conversation grid as the main done layout -->
  <div class="conversation-grid">
    <textarea
      class="asr-box"
      ref="asrBoxEl"
      v-model="editedText"
      placeholder="在此修改识别结果…"
      spellcheck="false"
    />
    <div class="assistant-panel">
      <DiffResult
        :original="originalText"
        :diffEntries="diffEntries"
        :hasResult="true"
        :editLog="editLog"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import DiffResult from './DiffResult.vue'
import { useDiff } from '../composables/useDiff'

const props = defineProps<{
  originalText: string
}>()

const { diffEntries, runDiff } = useDiff()

const editedText   = ref(props.originalText)
const editLog      = ref<string[]>([])
const prevUserText = ref(props.originalText)
const asrBoxEl     = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  const el = asrBoxEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function detectEditOp(oldText: string, newText: string): string | null {
  if (oldText === newText) return null
  const o = Array.from(oldText)
  const n = Array.from(newText)

  let pre = 0
  while (pre < o.length && pre < n.length && o[pre] === n[pre]) pre++

  let suf = 0
  while (suf < o.length - pre && suf < n.length - pre && o[o.length - 1 - suf] === n[n.length - 1 - suf]) suf++

  const deleted  = o.slice(pre, o.length - suf).join('')
  const inserted = n.slice(pre, n.length - suf).join('')

  if (deleted && inserted) return `将「${deleted}」改为「${inserted}」`
  if (deleted)  return `删除「${deleted}」`
  if (inserted) return `添加「${inserted}」`
  return null
}

watch(editedText, async (newVal) => {
  runDiff(props.originalText, newVal)
  const op = detectEditOp(prevUserText.value, newVal)
  if (op) editLog.value.push(op)
  prevUserText.value = newVal
  await nextTick()
  autoResize()
})

onMounted(async () => {
  await nextTick()
  autoResize()
})
</script>

<style scoped>
/* ── Conversation grid (mirrors App.vue done layout) ── */
.conversation-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    ".         asr"
    "assistant .  ";
  column-gap: 1.5rem;
  row-gap: 1.5rem;
  padding-bottom: 0.5rem;
}

/* Recognition / editing box — top-right, blue bg / white text */
.asr-box {
  grid-area: asr;
  width: 100%;
  box-sizing: border-box;
  padding: 1rem 1.2rem;
  min-height: 80px;
  overflow: hidden;
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
  color: #ffffff;
  caret-color: #93c5fd;
  border: none;
  border-radius: 1rem;
  font-size: 1.05rem;
  line-height: 1.8;
  resize: none;
  font-family: inherit;
  box-shadow: 0 6px 28px rgba(29, 78, 216, 0.35);
  transition: box-shadow 0.2s;
}

.asr-box::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.asr-box:focus {
  outline: none;
  box-shadow: 0 6px 28px rgba(29, 78, 216, 0.45), 0 0 0 3px rgba(147, 197, 253, 0.5);
}

/* Assistant panel — bottom-left */
.assistant-panel {
  grid-area: assistant;
}
</style>
