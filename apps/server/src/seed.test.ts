import { validateDefinition } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { listAgents } from './db/agents.ts'
import { all, migrate, openDb } from './db/sqlite.ts'
import { seedExample } from './seed.ts'

describe('seedExample', () => {
  it('creates the example agent with v1 exactly once', () => {
    const db = openDb(':memory:')
    migrate(db)
    seedExample(db)
    seedExample(db)

    const agents = listAgents(db)
    expect(agents.map((a) => [a.name, a.status, a.currentVersion])).toEqual([
      ['Support email triage', 'active', 1],
    ])
    expect(agents.map((a) => validateDefinition(a.draft))).toEqual([[]])

    const piiNode = agents[0]?.draft.nodes.find((n) => n.id === 'pii')
    if (piiNode?.type !== 'check' || piiNode.check.kind !== 'regex') {
      throw new Error('seed is missing the regex card-number check')
    }
    const pattern = new RegExp(piiNode.check.pattern)
    expect(pattern.test('card 4111 1111 1111 1111')).toBe(true)
    expect(pattern.test('order 12345')).toBe(false)

    expect(all(db, 'SELECT id, kind, enabled_tools_json FROM connections')).toEqual([
      {
        id: 'builtin',
        kind: 'builtin',
        enabled_tools_json: '["now","http_request","memory_save","memory_search"]',
      },
    ])
    db.close()
  })
})
