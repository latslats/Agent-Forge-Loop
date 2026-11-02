import type { CheckConfig } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { runCheck } from './checks.ts'
import type { Llm } from './llm.ts'
import type { RunState } from './types.ts'

const stateWith = (overrides: Partial<RunState> = {}): RunState => ({
  input: 'hello',
  vars: {},
  prev: null,
  nodeId: null,
  costUsd: 0,
  tokensIn: 0,
  tokensOut: 0,
  toolsUsed: [],
  ...overrides,
})

// Only the judge is used by checks; message() would be a test bug.
const judgeLlm = (verdict: { pass: boolean; reason: string }, seen: string[] = []): Llm => ({
  message: async () => {
    throw new Error('message() is not used by checks')
  },
  judge: async ({ rubric, text }) => {
    seen.push(`${rubric}|${text}`)
    return {
      verdict,
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: 0.002,
      stopReason: 'end_turn',
      durationMs: 5,
    }
  },
})

const noLlm = judgeLlm({ pass: true, reason: 'unused' })

describe('regex check', () => {
  const block: CheckConfig = {
    kind: 'regex',
    pattern: '\\d{4}',
    flags: '',
    mode: 'block',
    target: 'output',
  }

  it('block passes when there is no match, and fails naming the match', async () => {
    const clean = await runCheck(block, stateWith({ prev: 'no digits here' }), { llm: noLlm })
    expect(clean.pass).toBe(true)

    const found = await runCheck(block, stateWith({ prev: 'code 1234 inside' }), { llm: noLlm })
    expect(found.pass).toBe(false)
    expect(found.reason).toContain('1234')
  })

  it('require passes when there is a match, and fails when there is none', async () => {
    const require: CheckConfig = { ...block, mode: 'require' }
    expect((await runCheck(require, stateWith({ prev: 'ref 9876' }), { llm: noLlm })).pass).toBe(
      true,
    )
    const missing = await runCheck(require, stateWith({ prev: 'no ref' }), { llm: noLlm })
    expect(missing.pass).toBe(false)
    expect(missing.reason).toContain('No match')
  })

  it('reads the target: input or output, and writes other values as JSON', async () => {
    const onInput: CheckConfig = { ...block, target: 'input', mode: 'require' }
    expect(
      (await runCheck(onInput, stateWith({ input: 'id 4455', prev: 'x' }), { llm: noLlm })).pass,
    ).toBe(true)

    // prev is an object: the check sees its JSON text, where the digits sit inside a string.
    const onObject = await runCheck(block, stateWith({ prev: { note: 'code 2222' } }), {
      llm: noLlm,
    })
    expect(onObject.pass).toBe(false)
  })
})

describe('json_schema check', () => {
  const schema: CheckConfig = {
    kind: 'json_schema',
    schema: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'] },
    target: 'output',
  }

  it('passes an object that matches', async () => {
    const result = await runCheck(schema, stateWith({ prev: { reply: 'hi' } }), { llm: noLlm })
    expect(result).toEqual({ pass: true, reason: 'Matches the JSON schema' })
  })

  it('parses a JSON string target before validating it', async () => {
    const result = await runCheck(schema, stateWith({ prev: '{"reply":"hi"}' }), { llm: noLlm })
    expect(result.pass).toBe(true)
  })

  it('fails with the problems', async () => {
    const result = await runCheck(schema, stateWith({ prev: '{"other":1}' }), { llm: noLlm })
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('$.reply is required')
  })
})

describe('llm_judge check', () => {
  it('returns the judge verdict and passes the rubric and the target text', async () => {
    const seen: string[] = []
    const check: CheckConfig = { kind: 'llm_judge', rubric: 'Polite?', target: 'output' }
    const llm = judgeLlm({ pass: false, reason: 'rude' }, seen)

    const result = await runCheck(check, stateWith({ prev: 'Go away' }), { llm })

    expect(result).toMatchObject({ pass: false, reason: 'rude' })
    expect(result.judge).toMatchObject({ model: 'claude-haiku-5-5', costUsd: 0.002 })
    expect(seen).toEqual(['Polite?|Go away'])
  })
})

describe('cost_cap check', () => {
  const check: CheckConfig = { kind: 'cost_cap', maxUsd: 0.05 }

  it('passes at or under the cap and fails above it', async () => {
    expect((await runCheck(check, stateWith({ costUsd: 0.05 }), { llm: noLlm })).pass).toBe(true)
    const over = await runCheck(check, stateWith({ costUsd: 0.06 }), { llm: noLlm })
    expect(over.pass).toBe(false)
    expect(over.reason).toContain('over')
  })
})

describe('tool_allowlist check', () => {
  const check: CheckConfig = { kind: 'tool_allowlist', tools: ['builtin__now'] }

  it('passes when every tool used is allowed, and names the ones that are not', async () => {
    expect(
      (await runCheck(check, stateWith({ toolsUsed: ['builtin__now'] }), { llm: noLlm })).pass,
    ).toBe(true)
    expect((await runCheck(check, stateWith({ toolsUsed: [] }), { llm: noLlm })).pass).toBe(true)

    const denied = await runCheck(
      check,
      stateWith({ toolsUsed: ['builtin__now', 'builtin__http_request'] }),
      { llm: noLlm },
    )
    expect(denied.pass).toBe(false)
    expect(denied.reason).toContain('builtin__http_request')
  })
})
