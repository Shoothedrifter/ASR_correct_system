import { describe, it, expect } from 'vitest'
import { computeDiff } from '../src/utils/diff'

describe('computeDiff', () => {
  it('returns empty array when both strings are identical', () => {
    const result = computeDiff('今天天气很好', '今天天气很好')
    expect(result).toEqual([])
  })

  it('returns empty array when both strings are empty', () => {
    const result = computeDiff('', '')
    expect(result).toEqual([])
  })

  it('detects a single 错字 (wrong character)', () => {
    // ASR said "在", should be "再"
    const result = computeDiff('我们在一起', '我们再一起')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('错字')
    expect(result[0].orig).toBe('在')
    expect(result[0].edit).toBe('再')
  })

  it('detects 多字 (ASR produced an extra character; user deleted it)', () => {
    // ASR output has an extra "天"; user deleted it in correction → 多字
    const result = computeDiff('今天天气好', '今天气好')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('多字')
    expect(result[0].orig).toBe('天')
    expect(result[0].edit).toBe('')
  })

  it('detects 漏字 (ASR missed a character; user added it)', () => {
    // ASR missed "非"; user added it in correction → 漏字
    const result = computeDiff('天气好', '天气非好')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('漏字')
    expect(result[0].orig).toBe('')
    expect(result[0].edit).toBe('非')
  })

  it('detects 标点错误 (punctuation substitution)', () => {
    // full-width comma → period
    const result = computeDiff('好，再见', '好。再见')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('标点错误')
    expect(result[0].orig).toBe('，')
    expect(result[0].edit).toBe('。')
  })

  it('handles multiple error types in one string', () => {
    // 错字: 在→再, 多字: ASR had extra 天, 漏字: ASR missed 非
    const result = computeDiff('今天在这里好', '今再这里非好')
    const types = result.map((e) => e.type)
    expect(types).toContain('错字')
    expect(types).toContain('多字')
    expect(types).toContain('漏字')
  })

  it('handles complete replacement (all chars different)', () => {
    const result = computeDiff('你好', '再见')
    expect(result.length).toBeGreaterThan(0)
    result.forEach((e) => {
      expect(['错字', '漏字', '多字', '标点错误']).toContain(e.type)
    })
  })

  it('handles strings with mixed Chinese and ASCII punctuation', () => {
    const result = computeDiff('hello,world', 'hello.world')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('标点错误')
    expect(result[0].orig).toBe(',')
    expect(result[0].edit).toBe('.')
  })
})
