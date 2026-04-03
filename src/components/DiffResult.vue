<template>
  <section class="panel" v-if="diffEntries.length > 0 || hasResult">
    <div class="panel-header">
      <!-- Robot icon replaces the text title -->
      <div class="panel-icon" title="校对小助手">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="8" width="18" height="12" rx="2.5"/>
          <circle cx="9"  cy="14" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none"/>
          <line x1="12" y1="8"  x2="12" y2="4"/>
          <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/>
          <line x1="3"  y1="13" x2="1"  y2="13"/>
          <line x1="21" y1="13" x2="23" y2="13"/>
          <path d="M9 18 Q12 20.5 15 18"/>
        </svg>
      </div>
      <div class="badges">
        <span
          v-for="[type, count] in typeCounts"
          :key="type"
          class="badge"
          :class="badgeClass(type)"
        >{{ type }} ×{{ count }}</span>
        <span class="badge total">共 {{ typeCounts.reduce((s, [, n]) => s + n, 0) }} 处</span>
      </div>
    </div>

    <!-- Real-time edit log -->
    <div v-if="editLog && editLog.length > 0" class="edit-log" ref="logEl">
      <p v-for="(msg, idx) in editLog" :key="idx" class="log-entry">{{ msg }}</p>
    </div>

    <!-- Diff view -->
    <div class="diff-view" v-if="annotatedChars.length > 0">
      <span
        v-for="(seg, idx) in annotatedChars"
        :key="idx"
        :class="seg.cssClass"
        :title="seg.tooltip"
      >{{ seg.char }}</span>
    </div>
    <p v-else class="no-diff">识别结果与校对文本完全一致，无差异。</p>

    <!-- Accuracy rate -->
    <div v-if="accuracy !== null" class="accuracy-bar">
      <span class="accuracy-label">识别准确率{{ hasModification ? '' : '（未修改）' }}</span>
      <span class="accuracy-value" :class="accuracyClass">{{ accuracy }}%</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { DiffEntry, DiffType } from '../types'

const props = defineProps<{
  original: string
  diffEntries: readonly DiffEntry[]
  hasResult: boolean
  editLog?: readonly string[]
}>()

const logEl = ref<HTMLElement | null>(null)

watch(() => props.editLog?.length, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})

const diffMap = computed(() => {
  const map = new Map<number, DiffEntry>()
  for (const entry of props.diffEntries) {
    if (entry.orig !== '') map.set(entry.origIdx, entry)
  }
  return map
})

const insertions = computed(() =>
  props.diffEntries.filter((e) => e.orig === '' && e.edit !== ''),
)

interface AnnotatedChar {
  char: string
  cssClass: string
  tooltip: string
}

const annotatedChars = computed((): AnnotatedChar[] => {
  const chars = Array.from(props.original)
  const result: AnnotatedChar[] = []

  const insertBefore = new Map<number, DiffEntry[]>()
  for (const ins of insertions.value) {
    const list = insertBefore.get(ins.origIdx) ?? []
    list.push(ins)
    insertBefore.set(ins.origIdx, list)
  }
  const trailingInsertions = insertBefore.get(chars.length) ?? []

  for (let i = 0; i < chars.length; i++) {
    for (const ins of insertBefore.get(i) ?? []) {
      result.push({ char: ins.edit, cssClass: 'diff-extra', tooltip: `多字：「${ins.edit}」` })
    }
    const entry = diffMap.value.get(i)
    if (entry) {
      if (entry.edit === '') {
        result.push({ char: chars[i], cssClass: 'diff-missing', tooltip: `漏字：「${chars[i]}」` })
      } else {
        result.push({
          char: chars[i],
          cssClass: entry.type === '标点错误' ? 'diff-punct' : 'diff-wrong',
          tooltip: `${entry.type}：「${entry.orig}」→「${entry.edit}」`,
        })
      }
    } else {
      result.push({ char: chars[i], cssClass: '', tooltip: '' })
    }
  }
  for (const ins of trailingInsertions) {
    result.push({ char: ins.edit, cssClass: 'diff-extra', tooltip: `多字：「${ins.edit}」` })
  }
  return result
})

// True when the user has changed anything relative to the original ASR text
const hasModification = computed(() => props.diffEntries.length > 0)

// Only count 错词 and 标点错误; 漏字/多字 shown visually but excluded from stats
const typeCounts = computed((): [DiffType, number][] => {
  const counts = new Map<DiffType, number>()
  for (const entry of props.diffEntries) {
    if (entry.type === '错词' || entry.type === '标点错误') {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries()) as [DiffType, number][]
})

const accuracy = computed((): string | null => {
  if (!props.hasResult || !props.original) return null
  const origLen = Array.from(props.original).length
  let subs = 0, dels = 0, ins = 0
  for (const e of props.diffEntries) {
    if (e.orig !== '' && e.edit !== '') subs++
    else if (e.orig !== '' && e.edit === '') dels++
    else if (e.orig === '' && e.edit !== '') ins++
  }
  const refLen = origLen - dels + ins
  if (refLen === 0) return '100.0'
  const errors = subs + dels + ins
  return Math.max(0, (1 - errors / refLen) * 100).toFixed(1)
})

const accuracyClass = computed(() => {
  const val = parseFloat(accuracy.value ?? '0')
  if (val >= 95) return 'acc-high'
  if (val >= 80) return 'acc-mid'
  return 'acc-low'
})

function badgeClass(type: DiffType): string {
  const map: Record<DiffType, string> = {
    错词: 'badge-wrong',
    漏字: 'badge-missing',
    多字: 'badge-extra',
    标点错误: 'badge-punct',
  }
  return map[type]
}
</script>

<style scoped>
/* ── Panel card ──────────────────────────────────── */
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  background: #ffffff;
  border-radius: 1rem;
  padding: 1.2rem 1.4rem;
  border-top: 3px solid #3b82f6;
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.1), 0 1px 4px rgba(0, 0, 0, 0.05);
}

/* ── Panel header ────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Robot icon in a blue rounded-square */
.panel-icon {
  width: 34px;
  height: 34px;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.28);
}

/* ── Badges ──────────────────────────────────────── */
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-left: auto;
}

.badge {
  padding: 0.15rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.badge-wrong   { background: #fff1f2; color: #be123c; border: 1px solid #fda4af; }
.badge-missing { background: #fff7ed; color: #c2410c; border: 1px solid #fdba74; }
.badge-extra   { background: #f0fdf4; color: #15803d; border: 1px solid #86efac; }
.badge-punct   { background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd; }
.total         { background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; }

/* ── Edit log ────────────────────────────────────── */
.edit-log {
  max-height: 140px;
  overflow-y: auto;
  background: linear-gradient(to bottom, #f8faff, #eff6ff);
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  padding: 0.6rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.log-entry {
  margin: 0;
  font-size: 0.86rem;
  color: #1d4ed8;
  line-height: 1.6;
}

.log-entry::before {
  content: '›  ';
  color: #3b82f6;
  font-weight: 700;
}

/* ── Diff view ───────────────────────────────────── */
.diff-view {
  padding: 0.85rem 1.1rem;
  background: #f8faff;
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  font-size: 1rem;
  line-height: 1.9;
  word-break: break-all;
  color: #1e293b;
}

:deep(.diff-wrong) {
  color: #be123c;
  text-decoration: underline wavy #fda4af;
  cursor: help;
}

:deep(.diff-missing) {
  color: #c2410c;
  text-decoration: line-through;
  cursor: help;
}

:deep(.diff-extra) {
  background: #bbf7d0;
  color: #15803d;
  border-radius: 3px;
  cursor: help;
}

:deep(.diff-punct) {
  color: #1d4ed8;
  text-decoration: underline dotted #93c5fd;
  cursor: help;
}

.no-diff {
  font-size: 0.9rem;
  color: #16a34a;
  font-weight: 500;
  margin: 0;
  padding: 0.4rem 0;
}

/* ── Accuracy bar ────────────────────────────────── */
.accuracy-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 1rem;
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  font-size: 0.88rem;
}

.accuracy-label {
  color: #475569;
  font-weight: 500;
}

.accuracy-value {
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 0.02em;
}

.acc-high { color: #15803d; }
.acc-mid  { color: #c2410c; }
.acc-low  { color: #be123c; }
</style>
