import { describe, expect, it } from 'vitest'
import { createLlm, estimateCost } from './llm.ts'

const MILLION = 1_000_000

describe('estimateCost', () => {
  it('prices input and output per million tokens', () => {
    const usage = {
      inputTokens: MILLION,
      outputTokens: MILLION,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    expect(estimateCost('claude-sonnet-5-5', usage)).toBeCloseTo(12)
    expect(estimateCost('claude-opus-5-5', usage)).toBeCloseTo(24)
    expect(estimateCost('claude-haiku-5-5', usage)).toBeCloseTo(0.6)
  })

  it('prices cache reads and writes separately', () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: MILLION,
      cacheWriteTokens: MILLION,
    }
    expect(estimateCost('claude-sonnet-5-5', usage)).toBeCloseTo(2.7)
  })
})

describe('createLlm without a key', () => {
  it('rejects every call with the missing-key message', async () => {
    const llm = createLlm(undefined)
    await expect(llm.judge({ rubric: 'be kind', text: 'hi' })).rejects.toThrow(
      'ANTHROPIC_API_KEY is not set (add it to .env)',
    )
    await expect(createLlm('').judge({ rubric: 'x', text: 'y' })).rejects.toThrow(
      'ANTHROPIC_API_KEY is not set',
    )
  })
})
