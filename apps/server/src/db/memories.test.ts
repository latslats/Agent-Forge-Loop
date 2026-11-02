import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NotFoundError } from '../errors.ts'
import { createAgent, publishVersion } from './agents.ts'
import {
  clearMemories,
  createMemory,
  listMemories,
  removeMemory,
  searchMemories,
} from './memories.ts'
import { seedRun } from './run-fixtures.ts'
import { type Db, migrate, openDb } from './sqlite.ts'

let db: Db
let agentId: string
let runId: string

beforeEach(() => {
  db = openDb(':memory:')
  migrate(db)
  agentId = createAgent(db, { name: 'Remembers', description: '' }).id
  publishVersion(db, agentId, 'test')
  runId = seedRun(db, { agentId, status: 'succeeded', createdAt: new Date().toISOString() })
})

afterEach(() => {
  db.close()
})

describe('memories', () => {
  it('lists newest first and stores the source run', () => {
    createMemory(db, agentId, 'first', runId)
    createMemory(db, agentId, 'second')

    const listed = listMemories(db, agentId)

    expect(listed.map((memory) => memory.content)).toEqual(['second', 'first'])
    expect(listed[1]?.sourceRunId).toBe(runId)
    expect(listed[0]?.sourceRunId).toBeNull()
  })

  it('applies the limit when one is given', () => {
    for (const content of ['a', 'b', 'c']) createMemory(db, agentId, content)

    expect(listMemories(db, agentId, 2).map((memory) => memory.content)).toEqual(['c', 'b'])
  })

  it('searches content without regard to case and returns at most 5 matches', () => {
    createMemory(db, agentId, 'Customer likes TEA')
    createMemory(db, agentId, 'ships on Monday')

    expect(searchMemories(db, agentId, 'tea').map((memory) => memory.content)).toEqual([
      'Customer likes TEA',
    ])

    for (let index = 0; index < 6; index++) createMemory(db, agentId, `note ${index}`)
    expect(searchMemories(db, agentId, 'note')).toHaveLength(5)
  })

  it('treats % and _ in the query as plain text', () => {
    createMemory(db, agentId, 'discount is 50% off')
    createMemory(db, agentId, 'discount is 500 off')

    expect(searchMemories(db, agentId, '50%').map((memory) => memory.content)).toEqual([
      'discount is 50% off',
    ])
    expect(searchMemories(db, agentId, '_')).toEqual([])
  })

  it('clears only the given agent and returns the count', () => {
    const other = createAgent(db, { name: 'Other', description: '' }).id
    createMemory(db, agentId, 'mine')
    createMemory(db, agentId, 'also mine')
    createMemory(db, other, 'theirs')

    expect(clearMemories(db, agentId)).toBe(2)
    expect(listMemories(db, agentId)).toEqual([])
    expect(listMemories(db, other)).toHaveLength(1)
  })

  it('removes one memory and rejects an unknown id', () => {
    const memory = createMemory(db, agentId, 'gone soon')

    removeMemory(db, memory.id)

    expect(listMemories(db, agentId)).toEqual([])
    expect(() => removeMemory(db, memory.id)).toThrow(NotFoundError)
  })

  it('rejects an unknown agent', () => {
    expect(() => createMemory(db, 'no-such-agent', 'x')).toThrow(NotFoundError)
    expect(() => listMemories(db, 'no-such-agent')).toThrow(NotFoundError)
    expect(() => clearMemories(db, 'no-such-agent')).toThrow(NotFoundError)
  })
})
