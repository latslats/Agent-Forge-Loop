import { describe, expect, it } from 'vitest'
import { buildScorer, scorerChipLabel, scorerKindLabel } from './scorer-builder.ts'

describe('buildScorer', () => {
  it('builds each kind from its text', () => {
    expect(buildScorer('exact', ' 4 ')).toEqual({
      ok: true,
      scorer: { kind: 'exact', expected: '4' },
    })
    expect(buildScorer('tool_calls', 'lookup_order, , now')).toEqual({
      ok: true,
      scorer: { kind: 'tool_calls', tools: ['lookup_order', 'now'] },
    })
    expect(buildScorer('latency', '5000')).toEqual({
      ok: true,
      scorer: { kind: 'latency', maxMs: 5000 },
    })
    expect(buildScorer('cost', '0.01')).toEqual({
      ok: true,
      scorer: { kind: 'cost', maxUsd: 0.01 },
    })
  })

  it('reads a JSON schema and defaults the judge threshold', () => {
    const schema = buildScorer('json_schema', '{"type":"object"}')
    expect(schema).toEqual({
      ok: true,
      scorer: { kind: 'json_schema', schema: { type: 'object' } },
    })
    const judge = buildScorer('llm_judge', 'Is it polite?')
    expect(judge).toEqual({
      ok: true,
      scorer: { kind: 'llm_judge', rubric: 'Is it polite?', threshold: 0.7 },
    })
  })

  it('explains what to fix instead of building a bad scorer', () => {
    expect(buildScorer('exact', '  ')).toEqual({ ok: false, error: 'Enter the expected output.' })
    expect(buildScorer('json_schema', 'not json')).toEqual({
      ok: false,
      error: 'Check the json schema.',
    })
    expect(buildScorer('latency', 'soon')).toMatchObject({ ok: false })
  })
})

describe('scorer labels', () => {
  it('shows a short chip for each scorer', () => {
    expect(scorerChipLabel({ kind: 'exact', expected: '4' })).toBe('Exact “4”')
    expect(scorerChipLabel({ kind: 'latency', maxMs: 5000 })).toBe('Latency ≤ 5000 ms')
  })

  it('passes unknown result kinds through unchanged', () => {
    expect(scorerKindLabel('cost')).toBe('Cost')
    expect(scorerKindLabel('run')).toBe('run')
  })
})
