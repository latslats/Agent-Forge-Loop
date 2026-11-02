import { type AgentDefinition, type AiNode, defaultDefinition } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createMemory } from '../../db/memories.ts'
import { seedRun } from '../../db/run-fixtures.ts'
import { migrate, openDb } from '../../db/sqlite.ts'
import type { MessageParams } from '../llm.ts'
import { fakeLlm, publishAgent, testEngine, textMessage, toolUseMessage } from '../testing.ts'
import type { NodeIo, RunState } from '../types.ts'
import { runAiNode } from './ai.ts'

const aiNodeOf = (definition: AgentDefinition): AiNode => {
  const node = definition.nodes.find((candidate) => candidate.type === 'ai')
  if (node?.type !== 'ai') throw new Error('definition has no ai node')
  return node
}

const newState = (input: unknown): RunState => ({
  input,
  vars: {},
  prev: null,
  nodeId: null,
  costUsd: 0,
  tokensIn: 0,
  tokensOut: 0,
  toolsUsed: [],
})

const systemText = (params: MessageParams | undefined): string =>
  (params?.system ?? []).map((block) => block.text).join('\n')

describe('AI step tool loop', () => {
  it('runs every tool_use block and sends one user message with all tool results', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const calls: MessageParams[] = []
    const llm = fakeLlm(async (params) => {
      calls.push(params)
      return calls.length === 1
        ? toolUseMessage([
            { id: 'toolu_1', name: 'builtin__now', input: {} },
            { id: 'toolu_2', name: 'builtin__now', input: {} },
          ])
        : textMessage('{"ok":true}')
    })
    const deps = testEngine(db, llm)
    const definition: AgentDefinition = {
      ...defaultDefinition('Agent'),
      tools: [{ connectionId: 'builtin', tool: 'now' }],
    }
    const runId = seedRun(db, {
      agentId: publishAgent(db, definition),
      status: 'running',
      createdAt: new Date().toISOString(),
    })
    const emitted: string[] = []
    const io: NodeIo = {
      runId,
      definition,
      deps,
      signal: new AbortController().signal,
      emit: (kind, nodeId, payload) => {
        emitted.push(kind)
        return { id: 'e', runId, seq: emitted.length, ts: '', kind, nodeId, payload }
      },
    }
    const state = newState('hello')

    const outcome = await runAiNode(aiNodeOf(definition), state, io)

    expect(outcome).toEqual({ type: 'next', prev: { ok: true } })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.tools.map((tool) => tool.name)).toEqual(['builtin__now'])
    expect(calls[0]?.tools[0]?.strict).toBe(true)

    const resultTurn = calls[1]?.messages.at(-1)
    expect(resultTurn?.role).toBe('user')
    const content = resultTurn?.content
    expect(Array.isArray(content)).toBe(true)
    const toolUseIds = Array.isArray(content)
      ? content.flatMap((block) => (block.type === 'tool_result' ? [block.tool_use_id] : []))
      : []
    expect(toolUseIds).toEqual(['toolu_1', 'toolu_2'])

    expect(state.toolsUsed).toEqual(['builtin__now'])
    expect(state.tokensIn).toBe(20)
    expect(emitted).toEqual([
      'model_call',
      'tool_call',
      'tool_call',
      'tool_result',
      'tool_result',
      'model_call',
    ])
    db.close()
  })

  it('fails with a clear message when the model hits max_tokens', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const llm = fakeLlm(async () => ({
      ...textMessage('cut off'),
      stop_reason: 'max_tokens',
    }))
    const deps = testEngine(db, llm)
    const definition = defaultDefinition('Agent')
    const runId = seedRun(db, {
      agentId: publishAgent(db, definition),
      status: 'running',
      createdAt: new Date().toISOString(),
    })
    const io: NodeIo = {
      runId,
      definition,
      deps,
      signal: new AbortController().signal,
      emit: (kind, nodeId, payload) => ({
        id: 'e',
        runId,
        seq: 1,
        ts: '',
        kind,
        nodeId,
        payload,
      }),
    }

    const outcome = await runAiNode(aiNodeOf(definition), newState('x'), io)

    expect(outcome).toEqual({
      type: 'fail',
      error: 'The model reached max_tokens before the step finished',
    })
    db.close()
  })
})

describe('AI step memory facts', () => {
  // Runs one AI step with a fake Llm that answers at once. Returns the system the model received
  // and the log messages the step emitted.
  const runStep = async (
    memoryEnabled: boolean,
    seed: (agentId: string, db: ReturnType<typeof openDb>) => void = () => {},
  ) => {
    const db = openDb(':memory:')
    migrate(db)
    const definition: AgentDefinition = {
      ...defaultDefinition('Agent'),
      memory: { enabled: memoryEnabled },
    }
    const agentId = publishAgent(db, definition)
    seed(agentId, db)
    const runId = seedRun(db, { agentId, status: 'running', createdAt: new Date().toISOString() })
    const calls: MessageParams[] = []
    const logs: string[] = []
    const io: NodeIo = {
      runId,
      definition,
      deps: testEngine(
        db,
        fakeLlm(async (params) => {
          calls.push(params)
          return textMessage('{"ok":true}')
        }),
      ),
      signal: new AbortController().signal,
      emit: (kind, nodeId, payload) => {
        if (kind === 'log') logs.push(String(payload.message))
        return { id: 'e', runId, seq: 1, ts: '', kind, nodeId, payload }
      },
    }
    await runAiNode(aiNodeOf(definition), newState('hi'), io)
    db.close()
    return { system: systemText(calls[0]), logs }
  }

  it('adds the remembered facts to the system prompt when memory is enabled', async () => {
    const { system, logs } = await runStep(true, (agentId, db) => {
      createMemory(db, agentId, 'Customer prefers email')
      createMemory(db, agentId, 'Refund limit is 50')
    })

    expect(system).toContain(
      'Facts remembered from earlier runs:\n- Refund limit is 50\n- Customer prefers email',
    )
    expect(logs).toEqual(['Loaded 2 memories'])
  })

  it('loads at most the 20 newest facts', async () => {
    const { system } = await runStep(true, (agentId, db) => {
      for (let index = 0; index < 21; index++) createMemory(db, agentId, `fact ${index}`)
    })

    expect(system).toContain('- fact 20')
    expect(system).toContain('- fact 1\n')
    expect(system).not.toContain('- fact 0')
  })

  it('leaves the system prompt unchanged when memory is disabled', async () => {
    const { system, logs } = await runStep(false, (agentId, db) => {
      createMemory(db, agentId, 'Customer prefers email')
    })

    expect(system).not.toContain('Facts remembered from earlier runs')
    expect(logs).toEqual([])
  })

  it('emits no memory log when the agent has no facts yet', async () => {
    const { system, logs } = await runStep(true)

    expect(system).not.toContain('Facts remembered from earlier runs')
    expect(logs).toEqual([])
  })
})
