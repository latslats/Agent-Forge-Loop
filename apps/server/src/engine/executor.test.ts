import { AgentDefinition } from '@agentforgeloop/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRun, listEvents, loadRun, updateRun } from '../db/runs.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import {
  cancelRun,
  executeRun,
  nextNode,
  recoverInterruptedRuns,
  resumeRun,
  startRun,
} from './executor.ts'
import {
  fakeLlm,
  publishAgent,
  testEngine,
  textMessage,
  toolUseMessage,
  waitFor,
} from './testing.ts'
import { createToolRegistry } from './tools/registry.ts'
import type { ToolDef } from './tools/types.ts'
import type { EngineDeps } from './types.ts'

const pos = { x: 0, y: 0 }
const def = (nodes: unknown[], edges: unknown[]): AgentDefinition =>
  AgentDefinition.parse({ name: 'Test', nodes, edges })
const trigger = { id: 'trigger', type: 'trigger', label: 'Trigger', position: pos }

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
  migrate(db)
})
afterEach(async () => {
  // A started run may still be waiting on its setImmediate; let it see the open database.
  await new Promise((resolve) => setTimeout(resolve, 20))
  db.close()
})

const TERMINAL = ['succeeded', 'failed', 'cancelled']

/** Starts a run and waits until it has a final status. */
const runToEnd = async (deps: EngineDeps, agentId: string, input: unknown) => {
  const run = startRun(deps, { agentId, triggerKind: 'manual', input })
  await waitFor(() => TERMINAL.includes(getRun(db, run.id).status))
  return getRun(db, run.id)
}

const kinds = (runId: string): string[] => listEvents(db, runId).map((event) => event.kind)

describe('executor', () => {
  it('walks trigger, AI step and output, and renders the output template', async () => {
    const definition = def(
      [
        trigger,
        { id: 'ai', type: 'ai', label: 'AI', prompt: 'Reply briefly.', position: pos },
        {
          id: 'out',
          type: 'output',
          label: 'Out',
          template: 'Reply: {{prev.reply}}',
          position: pos,
        },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'ai' },
        { id: 'e2', from: 'ai', to: 'out' },
      ],
    )
    const llm = fakeLlm(async () => textMessage('{"reply":"hi there"}'))
    const agentId = publishAgent(db, definition)

    const run = await runToEnd(testEngine(db, llm), agentId, { text: 'hello' })

    expect(run).toMatchObject({ status: 'succeeded', output: 'Reply: hi there', error: null })
    expect(run.tokensIn).toBe(10)
    expect(run.costUsd).toBeCloseTo(0.001)
    expect(kinds(run.id)).toEqual(
      expect.arrayContaining(['run_start', 'node_start', 'model_call', 'node_end', 'run_end']),
    )
    expect(kinds(run.id).at(-1)).toBe('run_end')
  })

  it('runs a code step: sets prev and writes vars', async () => {
    const definition = def(
      [
        trigger,
        {
          id: 'code',
          type: 'code',
          label: 'Code',
          source: 'vars.n = input.n; return { doubled: input.n * 2 }',
          position: pos,
        },
        { id: 'out', type: 'output', label: 'Out', template: '{{prev.doubled}}', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'code' },
        { id: 'e2', from: 'code', to: 'out' },
      ],
    )
    const agentId = publishAgent(db, definition)

    const run = await runToEnd(
      testEngine(
        db,
        fakeLlm(async () => textMessage('')),
      ),
      agentId,
      {
        n: 4,
      },
    )

    expect(run.output).toBe('8')
    expect(loadRun(db, run.id).state.vars).toEqual({ n: 4 })
  })

  it('follows the true edge or the false edge of a branch', async () => {
    const definition = def(
      [
        trigger,
        { id: 'branch', type: 'branch', label: 'Branch', expression: 'input.ok', position: pos },
        { id: 'yes', type: 'output', label: 'Yes', template: 'yes', position: pos },
        { id: 'no', type: 'output', label: 'No', template: 'no', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'branch' },
        { id: 'e2', from: 'branch', to: 'yes', label: 'true' },
        { id: 'e3', from: 'branch', to: 'no', label: 'false' },
      ],
    )
    const agentId = publishAgent(db, definition)
    const deps = testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    )

    expect((await runToEnd(deps, agentId, { ok: true })).output).toBe('yes')
    expect((await runToEnd(deps, agentId, { ok: false })).output).toBe('no')
  })

  it('passes prev through an output node whose template is empty', async () => {
    const definition = def(
      [
        trigger,
        { id: 'code', type: 'code', label: 'Code', source: 'return { x: 1 }', position: pos },
        { id: 'out', type: 'output', label: 'Out', template: '', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'code' },
        { id: 'e2', from: 'code', to: 'out' },
      ],
    )
    const agentId = publishAgent(db, definition)

    const run = await runToEnd(
      testEngine(
        db,
        fakeLlm(async () => textMessage('')),
      ),
      agentId,
      null,
    )

    expect(run).toMatchObject({ status: 'succeeded', output: { x: 1 } })
  })

  it('fails the run with the error and ends it with run_end', async () => {
    const definition = def(
      [
        trigger,
        {
          id: 'code',
          type: 'code',
          label: 'Code',
          source: "throw new Error('boom')",
          position: pos,
        },
        { id: 'out', type: 'output', label: 'Out', template: '', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'code' },
        { id: 'e2', from: 'code', to: 'out' },
      ],
    )
    const agentId = publishAgent(db, definition)

    const run = await runToEnd(
      testEngine(
        db,
        fakeLlm(async () => textMessage('')),
      ),
      agentId,
      null,
    )

    expect(run).toMatchObject({ status: 'failed', error: 'Code step threw: boom' })
    expect(kinds(run.id)).toEqual(expect.arrayContaining(['error', 'node_end', 'run_end']))
    const runEnd = listEvents(db, run.id).find((event) => event.kind === 'run_end')
    expect(runEnd?.payload).toMatchObject({ status: 'failed' })
  })

  it('cancels a run that is waiting on a model call', async () => {
    const definition = def(
      [
        trigger,
        { id: 'ai', type: 'ai', label: 'AI', prompt: 'Think.', position: pos },
        { id: 'out', type: 'output', label: 'Out', template: '', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'ai' },
        { id: 'e2', from: 'ai', to: 'out' },
      ],
    )
    // Never answers; only the abort signal ends the call.
    const llm = fakeLlm(
      (params) =>
        new Promise((_resolve, reject) => {
          params.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const deps = testEngine(db, llm)
    const agentId = publishAgent(db, definition)
    const run = startRun(deps, { agentId, triggerKind: 'manual', input: 'x' })
    await waitFor(() => getRun(db, run.id).status === 'running')

    const cancelled = cancelRun(deps, run.id)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(cancelled.status).toBe('cancelled')
    expect(getRun(db, run.id).status).toBe('cancelled')
    const runEnds = listEvents(db, run.id).filter((event) => event.kind === 'run_end')
    expect(runEnds).toHaveLength(1)
    expect(runEnds[0]?.payload).toMatchObject({ status: 'cancelled' })
  })

  it('stores nothing after run_end when a run is cancelled during a tool call', async () => {
    const definition = def(
      [
        trigger,
        {
          id: 'ai',
          type: 'ai',
          label: 'AI',
          prompt: 'Use the tool.',
          tools: [{ connectionId: 'test', tool: 'slow' }],
          position: pos,
        },
        { id: 'out', type: 'output', label: 'Out', template: '', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'ai' },
        { id: 'e2', from: 'ai', to: 'out' },
      ],
    )
    // Answers only when the run is cancelled, as a tool that ignores its own timeout would.
    const slow: ToolDef = {
      connectionId: 'test',
      name: 'slow',
      description: 'Waits until the run is cancelled.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: (_input, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve({ output: 'late', isError: false }))
        }),
    }
    const llm = fakeLlm(async () =>
      toolUseMessage([{ id: 'call-1', name: 'test__slow', input: {} }]),
    )
    const deps = { ...testEngine(db, llm), tools: createToolRegistry([slow]) }
    const agentId = publishAgent(db, definition)
    const run = startRun(deps, { agentId, triggerKind: 'manual', input: 'x' })
    await waitFor(() => kinds(run.id).includes('tool_call'))

    cancelRun(deps, run.id)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(kinds(run.id)).not.toContain('tool_result')
    expect(kinds(run.id).at(-1)).toBe('run_end')
  })

  it('resumes a waiting run from the edge after the paused node', async () => {
    const definition = def(
      [
        trigger,
        { id: 'code', type: 'code', label: 'Code', source: 'return "resumed"', position: pos },
        { id: 'out', type: 'output', label: 'Out', template: '{{prev}}', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'code' },
        { id: 'e2', from: 'code', to: 'out' },
      ],
    )
    const deps = testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    )
    const agentId = publishAgent(db, definition)
    const run = startRun(deps, { agentId, triggerKind: 'manual', input: null })
    // Pretend the run paused at the trigger before the setImmediate start could run.
    const { state } = loadRun(db, run.id)
    updateRun(db, run.id, { status: 'waiting_approval', state: { ...state, nodeId: 'trigger' } })

    await resumeRun(deps, run.id)

    expect(getRun(db, run.id)).toMatchObject({ status: 'succeeded', output: 'resumed' })
    // The paused node gets its node_end when the run resumes, so the timeline shows it finished.
    const paused = listEvents(db, run.id).filter(
      (e) => e.kind === 'node_end' && e.nodeId === 'trigger',
    )
    expect(paused).toHaveLength(1)
    expect(paused[0]?.payload).toMatchObject({ status: 'ok' })
  })

  it('marks queued or running runs failed at boot', async () => {
    const definition = def(
      [trigger, { id: 'out', type: 'output', label: 'Out', template: '', position: pos }],
      [{ id: 'e1', from: 'trigger', to: 'out' }],
    )
    const deps = testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    )
    const agentId = publishAgent(db, definition)
    const run = startRun(deps, { agentId, triggerKind: 'manual', input: null })

    recoverInterruptedRuns(db)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(getRun(db, run.id)).toMatchObject({ status: 'failed', error: 'interrupted by restart' })
    expect(kinds(run.id)).toEqual(['run_end'])
  })

  it('does not start a run that was cancelled while queued', async () => {
    const definition = def(
      [trigger, { id: 'out', type: 'output', label: 'Out', template: '', position: pos }],
      [{ id: 'e1', from: 'trigger', to: 'out' }],
    )
    const deps = testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    )
    const agentId = publishAgent(db, definition)
    const run = startRun(deps, { agentId, triggerKind: 'manual', input: null })
    cancelRun(deps, run.id)

    await executeRun(deps, run.id)

    expect(getRun(db, run.id).status).toBe('cancelled')
    expect(kinds(run.id)).not.toContain('run_start')
  })
})

describe('nextNode', () => {
  it('prefers the edge with the requested label, then an unlabelled one', () => {
    const definition = def(
      [
        trigger,
        { id: 'branch', type: 'branch', label: 'B', expression: 'true', position: pos },
        { id: 'yes', type: 'output', label: 'Y', template: '', position: pos },
        { id: 'no', type: 'output', label: 'N', template: '', position: pos },
        { id: 'other', type: 'output', label: 'O', template: '', position: pos },
      ],
      [
        { id: 'e1', from: 'trigger', to: 'branch' },
        { id: 'e2', from: 'branch', to: 'yes', label: 'true' },
        { id: 'e3', from: 'branch', to: 'no', label: 'false' },
      ],
    )
    expect(nextNode(definition, 'branch', 'true')).toBe('yes')
    expect(nextNode(definition, 'branch', 'fail')).toBeNull()
    expect(nextNode(definition, 'trigger')).toBe('branch')
  })
})
