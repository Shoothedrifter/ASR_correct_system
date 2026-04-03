/**
 * Convert Float32Array PCM samples to Int16Array (16-bit signed PCM).
 * Clamps values to [-1, 1] before scaling.
 */
export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}

/**
 * Downsample a Float32Array from sourceSampleRate to targetSampleRate.
 * Uses simple decimation (integer ratio only).
 */
export function downsample(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return input
  const ratio = sourceSampleRate / targetSampleRate
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    output[i] = input[Math.floor(i * ratio)]
  }
  return output
}
