import type { DiffEntry, DiffType } from '../types'

const PUNCTUATION = new Set(`，。！？、；：\u201c\u201d\u2018\u2019（）【】《》…—,.!?;:'"()[]{}<>`)

function isPunct(ch: string): boolean {
  return PUNCTUATION.has(ch)
}

/**
 * Compute LCS (Longest Common Subsequence) DP table.
 * dp[i][j] = LCS length of original[0..i-1] and edited[0..j-1].
 */
function buildLCSTable(original: string[], edited: string[]): number[][] {
  const m = original.length
  const n = edited.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (original[i - 1] === edited[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

/**
 * Backtrack through the LCS table to produce aligned pairs.
 * Each pair represents a character-level alignment between original and edited.
 */
function backtrack(
  dp: number[][],
  original: string[],
  edited: string[],
): Array<{ orig: string; edit: string; origIdx: number }> {
  const result: Array<{ orig: string; edit: string; origIdx: number }> = []
  let i = original.length
  let j = edited.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && original[i - 1] === edited[j - 1]) {
      // Characters match — part of LCS, no error
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Insertion in edited: extra character (多字)
      result.push({ orig: '', edit: edited[j - 1], origIdx: i })
      j--
    } else {
      // Deletion from original: missing character (漏字 or 错字)
      result.push({ orig: original[i - 1], edit: '', origIdx: i - 1 })
      i--
    }
  }

  result.reverse()
  return result
}

/**
 * Merge adjacent deletion+insertion pairs into substitution pairs.
 * After LCS backtracking and reversal the pattern for a substitution is always:
 *   deletion (orig=X, edit='', origIdx=k) followed immediately by
 *   insertion (orig='', edit=Y, origIdx=k+1)
 * These represent a single character being replaced (错字 or 标点错误).
 */
function mergePairs(
  pairs: Array<{ orig: string; edit: string; origIdx: number }>,
): Array<{ orig: string; edit: string; origIdx: number }> {
  const merged: Array<{ orig: string; edit: string; origIdx: number }> = []
  let k = 0
  while (k < pairs.length) {
    const cur = pairs[k]
    const next = pairs[k + 1]
    // Deletion followed by insertion at the immediately next position = substitution
    if (
      cur.orig !== '' &&
      cur.edit === '' &&
      next !== undefined &&
      next.orig === '' &&
      next.edit !== '' &&
      next.origIdx === cur.origIdx + 1
    ) {
      merged.push({ orig: cur.orig, edit: next.edit, origIdx: cur.origIdx })
      k += 2
    } else {
      merged.push(cur)
      k++
    }
  }
  return merged
}

function classifyPair(orig: string, edit: string): DiffType {
  if (orig === '') return '漏字'   // ASR missed this char; user had to add it
  if (edit === '') return '多字'   // ASR produced an extra char; user deleted it
  if (isPunct(orig) && isPunct(edit)) return '标点错误'
  return '错词'
}

/**
 * Compute character-level diff between original ASR text and human-edited text.
 * Returns only the differing entries (matches are excluded).
 *
 * @param original - The raw ASR-recognized string
 * @param edited   - The human-corrected string
 * @returns Array of DiffEntry describing each discrepancy
 */
export function computeDiff(original: string, edited: string): DiffEntry[] {
  const origChars = Array.from(original)
  const editChars = Array.from(edited)

  if (origChars.length === 0 && editChars.length === 0) return []

  const dp = buildLCSTable(origChars, editChars)
  const rawPairs = backtrack(dp, origChars, editChars)
  const mergedPairs = mergePairs(rawPairs)

  const entries: DiffEntry[] = []
  for (const { orig, edit, origIdx } of mergedPairs) {
    if (orig === edit) continue
    entries.push({
      orig,
      edit,
      origIdx,
      type: classifyPair(orig, edit),
    })
  }
  return entries
}
