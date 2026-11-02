import type { Run, RunEvent } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import type { Llm } from '../engine/llm.ts'
import { fakeLlm, textMessage } from '../engine/testing.ts'
import { runLatencyMs, type ScoreContext, score } from './scorers.ts'

const run = (overrides: Partial<Run> = {}): Run => ({
  id: 'run-1',
  agentId: 'agent-1',
  versionId: 'version-1',
  versionNumber: 1,
  triggerKind: 'eval',
  status: 'succeeded',
  input: null,
  output: null,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0.002,
  error: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:02.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const toolCall = (tool: string): RunEvent => ({
  id: `event-${tool}`,
  runId: 'run-1',
  seq: 1,
  ts: '2026-01-01T00:00:01.000Z',
  kind: 'tool_call',
  nodeId: 'ai',
  payload: { tool, input: {} },
})

/** A judge whose verdict is fixed; everything else in the fake Llm is unused by scorers. */
const judgeLlm = (pass: boolean): Llm => {
  const base = fakeLlm(async () => textMessage(''))
  return {
    ...base,
    judge: async () => ({
      ...(await base.judge({ rubric: '', text: '' })),
      verdict: { pass, reason: pass ? 'Warm and clear' : 'Too curt' },
    }),
  }
}

const ctx = (output: unknown, overrides: Partial<ScoreContext> = {}): ScoreContext => ({
  output,
  run: run({ output }),
  events: [],
  llm: fakeLlm(async () => textMessage('')),
  ...overrides,
})

describe('exact', () => {
  it('passes when the trimmed output equals the expected text', async () => {
    const result = await score({ kind: 'exact', expected: '4' }, ctx('  4 \n'))
    expect(result).toMatchObject({ kind: 'exact', pass: true })
    expect(result.reason).not.toBe('')
  })

  it('fails with the expected and actual text in the reason', async () => {
    const result = await score({ kind: 'exact', expected: '4' }, ctx('5'))
    expect(result).toMatchObject({ pass: false })
    expect(result.reason).toContain('Expected "4", got "5"')
  })
})

describe('contains', () => {
  it('passes on a case-insensitive substring', async () => {
    const result = await score(
      { kind: 'contains', expected: 'refund' },
      ctx('Your REFUND is on its way'),
    )
    expect(result).toMatchObject({ kind: 'contains', pass: true })
  })

  it('fails when the substring is missing', async () => {
    const result = await score({ kind: 'contains', expected: 'refund' }, ctx('Hello'))
    expect(result).toMatchObject({ pass: false })
    expect(result.reason).toContain('does not contain')
  })
})

describe('json_schema', () => {
  const schema = {
    type: 'object',
    properties: { category: { type: 'string' } },
    required: ['category'],
  }

  it('parses a JSON string output and validates it', async () => {
    const result = await score({ kind: 'json_schema', schema }, ctx('{"category":"billing"}'))
    expect(result).toMatchObject({ kind: 'json_schema', pass: true })
  })

  it('validates an object output as it is', async () => {
    const result = await score({ kind: 'json_schema', schema }, ctx({ category: 'billing' }))
    expect(result).toMatchObject({ pass: true })
  })

  it('fails with the schema problem when a required key is missing', async () => {
    const result = await score({ kind: 'json_schema', schema }, ctx({ reply: 'hi' }))
    expect(result).toMatchObject({ pass: false })
    expect(result.reason).toContain('category')
  })

  it('fails when a string output is not JSON', async () => {
    const result = await score({ kind: 'json_schema', schema }, ctx('plain text'))
    expect(result).toMatchObject({ pass: false, reason: 'The output is not valid JSON' })
  })
})

describe('llm_judge', () => {
  it('passes with score 1 when the judge passes', async () => {
    const result = await score(
      { kind: 'llm_judge', rubric: 'Is it polite?', threshold: 0.7 },
      ctx('Thanks!', { llm: judgeLlm(true) }),
    )
    expect(result).toEqual({ kind: 'llm_judge', pass: true, score: 1, reason: 'Warm and clear' })
  })

  it('fails with score 0 and the judge reason when the judge fails', async () => {
    const result = await score(
      { kind: 'llm_judge', rubric: 'Is it polite?', threshold: 0.7 },
      ctx('No.', { llm: judgeLlm(false) }),
    )
    expect(result).toEqual({ kind: 'llm_judge', pass: false, score: 0, reason: 'Too curt' })
  })
})

describe('tool_calls', () => {
  it('passes when every expected tool name appears among the tool_call events', async () => {
    const result = await score(
      { kind: 'tool_calls', tools: ['lookup_order'] },
      ctx('done', { events: [toolCall('lookup_order'), toolCall('now')] }),
    )
    expect(result).toMatchObject({ kind: 'tool_calls', pass: true })
  })

  it('fails and names the tool that was not called', async () => {
    const result = await score(
      { kind: 'tool_calls', tools: ['lookup_order', 'http_request'] },
      ctx('done', { events: [toolCall('lookup_order')] }),
    )
    expect(result).toMatchObject({ pass: false, reason: 'Did not call http_request' })
  })
})

describe('latency', () => {
  it('passes when the run took no longer than maxMs', async () => {
    const result = await score({ kind: 'latency', maxMs: 2000 }, ctx('x'))
    expect(result).toMatchObject({ kind: 'latency', pass: true })
  })

  it('fails when the run took longer than maxMs', async () => {
    const result = await score({ kind: 'latency', maxMs: 1000 }, ctx('x'))
    expect(result).toMatchObject({ pass: false })
    expect(result.reason).toContain('2000 ms')
  })
})

describe('cost', () => {
  it('passes when the run cost no more than maxUsd', async () => {
    const result = await score({ kind: 'cost', maxUsd: 0.01 }, ctx('x'))
    expect(result).toMatchObject({ kind: 'cost', pass: true })
  })

  it('fails when the run cost more than maxUsd', async () => {
    const result = await score({ kind: 'cost', maxUsd: 0.001 }, ctx('x'))
    expect(result).toMatchObject({ pass: false })
    expect(result.reason).toContain('$0.0020')
  })
})

describe('runLatencyMs', () => {
  it('is the time between start and finish, and 0 while unfinished', () => {
    expect(runLatencyMs(run())).toBe(2000)
    expect(runLatencyMs(run({ finishedAt: null }))).toBe(0)
  })
})
