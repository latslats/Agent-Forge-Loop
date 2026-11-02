import { McpConfig } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { ConflictError, NotFoundError } from '../errors.ts'
import { seedExample } from '../seed.ts'
import {
  createConnection,
  deleteConnection,
  getConnection,
  listConnections,
  updateConnection,
} from './connections.ts'
import { migrate, openDb } from './sqlite.ts'

const config = McpConfig.parse({ transport: 'http', url: 'https://mcp.example.test/mcp' })

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  seedExample(db)
  return db
}

describe('connections table', () => {
  it('lists the seeded built-in row first, with no config', () => {
    const [builtin] = listConnections(setup())
    expect(builtin).toMatchObject({ id: 'builtin', kind: 'builtin', config: null })
  })

  it('creates an MCP connection with no tools enabled', () => {
    const db = setup()
    const created = createConnection(db, { name: 'Docs', config })

    expect(created).toMatchObject({ kind: 'mcp', name: 'Docs', enabledTools: [], config })
    expect(getConnection(db, created.id).id).toBe(created.id)
  })

  it('updates only the given fields', () => {
    const db = setup()
    const created = createConnection(db, { name: 'Docs', config })

    const renamed = updateConnection(db, created.id, { name: 'Wiki' })
    expect(renamed).toMatchObject({ name: 'Wiki', config, enabledTools: [] })

    const enabled = updateConnection(db, created.id, { enabledTools: ['search'] })
    expect(enabled).toMatchObject({ name: 'Wiki', enabledTools: ['search'] })
  })

  it('deletes an MCP connection', () => {
    const db = setup()
    const created = createConnection(db, { name: 'Docs', config })

    deleteConnection(db, created.id)

    expect(listConnections(db).map((c) => c.id)).toEqual(['builtin'])
  })

  it('refuses to delete the built-in row', () => {
    expect(() => deleteConnection(setup(), 'builtin')).toThrow(ConflictError)
  })

  it('refuses a config on the built-in row', () => {
    expect(() => updateConnection(setup(), 'builtin', { config })).toThrow(ConflictError)
  })

  it('throws NotFoundError for an unknown id', () => {
    const db = setup()
    expect(() => getConnection(db, 'nope')).toThrow(NotFoundError)
    expect(() => deleteConnection(db, 'nope')).toThrow(NotFoundError)
  })
})
