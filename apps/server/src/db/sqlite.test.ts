import { describe, expect, it } from 'vitest'
import { all, migrate, openDb } from './sqlite.ts'

const TABLES = [
  'agents',
  'agent_versions',
  'triggers',
  'runs',
  'run_events',
  'approvals',
  'memories',
  'connections',
  'eval_datasets',
  'eval_cases',
  'eval_runs',
  'eval_results',
]

describe('migrate', () => {
  it('creates the data model tables and is idempotent', () => {
    const db = openDb(':memory:')
    migrate(db)
    migrate(db)

    const tables = all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table'")
    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining(TABLES))
    expect(all(db, 'SELECT name FROM _migrations')).toHaveLength(1)
    db.close()
  })
})
