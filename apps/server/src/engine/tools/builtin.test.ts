import { defaultDefinition } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { listMemories } from '../../db/memories.ts'
import { seedRun } from '../../db/run-fixtures.ts'
import { migrate, openDb } from '../../db/sqlite.ts'
import { publishAgent } from '../testing.ts'
import { createToolRegistry } from './registry.ts'

const memoryRef = (tool: 'memory_save' | 'memory_search') => ({
  connectionId: 'builtin',
  tool,
})

describe('memory tools', () => {
  it('memory_save stores the fact with the run agent and run id, memory_search finds it', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const agentId = publishAgent(db, defaultDefinition('Remembers'))
    const runId = seedRun(db, { agentId, status: 'running', createdAt: new Date().toISOString() })
    const registry = createToolRegistry()
    const signal = new AbortController().signal
    const ctx = { db, agentId, runId }

    const saved = await registry.call(
      memoryRef('memory_save'),
      { content: 'Ships on Mondays' },
      signal,
      ctx,
    )
    const found = await registry.call(memoryRef('memory_search'), { query: 'monday' }, signal, ctx)

    expect(saved).toEqual({ output: { saved: true }, isError: false })
    expect(listMemories(db, agentId)).toMatchObject([
      { agentId, content: 'Ships on Mondays', sourceRunId: runId },
    ])
    expect(found).toEqual({ output: { matches: ['Ships on Mondays'] }, isError: false })
    db.close()
  })

  it('returns an error result for an empty fact and when no run context is given', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const agentId = publishAgent(db, defaultDefinition('Remembers'))
    const runId = seedRun(db, { agentId, status: 'running', createdAt: new Date().toISOString() })
    const registry = createToolRegistry()
    const signal = new AbortController().signal

    const empty = await registry.call(memoryRef('memory_save'), { content: '' }, signal, {
      db,
      agentId,
      runId,
    })
    const noContext = await registry.call(memoryRef('memory_save'), { content: 'x' }, signal)

    expect(empty.isError).toBe(true)
    expect(noContext.isError).toBe(true)
    expect(listMemories(db, agentId)).toEqual([])
    db.close()
  })
})
