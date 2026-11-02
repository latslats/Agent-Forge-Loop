import type { RunEvent } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { durationLabel, modelLabel, parseRunInput, usageTotals } from './run-format.ts'

const modelCall = (inputTokens: number, outputTokens: number, costUsd: number): RunEvent => ({
  id: `e${inputTokens}`,
  runId: 'r1',
  seq: 1,
  ts: '2026-10-13T10:00:00.000Z',
  kind: 'model_call',
  nodeId: 'n1',
  payload: {
    model: 'claude-sonnet-5-5',
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd,
    stopReason: 'end_turn',
    durationMs: 800,
  },
})

describe('parseRunInput', () => {
  it('sends JSON that parses to an object as that object', () => {
    expect(parseRunInput(' {"orderId": 42} ')).toEqual({ orderId: 42 })
    expect(parseRunInput('[1, 2]')).toEqual([1, 2])
  })

  it('sends anything else as trimmed text', () => {
    expect(parseRunInput('  My order arrived damaged  ')).toBe('My order arrived damaged')
    expect(parseRunInput('123')).toBe('123')
    expect(parseRunInput('null')).toBe('null')
  })
})

describe('durationLabel', () => {
  it('uses milliseconds, seconds, then minutes', () => {
    expect(durationLabel(850)).toBe('850 ms')
    expect(durationLabel(4200)).toBe('4.2 s')
    expect(durationLabel(125_000)).toBe('2m 5s')
  })
})

describe('modelLabel', () => {
  it('shortens known model ids and keeps unknown ones', () => {
    expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
    expect(modelLabel('some-other-model')).toBe('some-other-model')
  })
})

describe('usageTotals', () => {
  it('sums cost and tokens over model_call events only', () => {
    const totals = usageTotals([modelCall(1200, 340, 0.0041), modelCall(100, 50, 0.001)])
    expect(totals.tokens).toBe(1690)
    expect(totals.costUsd).toBeCloseTo(0.0051)
  })
})
