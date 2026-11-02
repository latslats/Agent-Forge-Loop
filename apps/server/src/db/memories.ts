import { Memory } from '@agentforgeloop/shared'
import { NotFoundError } from '../errors.ts'
import { all, type Db, get, newId, nowIso, run } from './sqlite.ts'

type MemoryRow = {
  id: string
  agent_id: string
  content: string
  source_run_id: string | null
  created_at: string
}

const toMemory = (row: MemoryRow): Memory =>
  Memory.parse({
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    sourceRunId: row.source_run_id,
    createdAt: row.created_at,
  })

const assertAgent = (db: Db, agentId: string): void => {
  if (!get(db, 'SELECT id FROM agents WHERE id = ?', [agentId]))
    throw new NotFoundError(`Agent ${agentId} not found`)
}

/** Newest first. `limit` omitted returns every memory (SQLite reads LIMIT -1 as no limit). */
export const listMemories = (db: Db, agentId: string, limit?: number): Memory[] => {
  assertAgent(db, agentId)
  return all<MemoryRow>(
    db,
    'SELECT * FROM memories WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    [agentId, limit ?? -1],
  ).map(toMemory)
}

export const createMemory = (
  db: Db,
  agentId: string,
  content: string,
  sourceRunId: string | null = null,
): Memory => {
  assertAgent(db, agentId)
  const id = newId()
  run(
    db,
    'INSERT INTO memories (id, agent_id, content, source_run_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, agentId, content, sourceRunId, nowIso()],
  )
  return toMemory(get<MemoryRow>(db, 'SELECT * FROM memories WHERE id = ?', [id]) as MemoryRow)
}

export const removeMemory = (db: Db, id: string): void => {
  if (run(db, 'DELETE FROM memories WHERE id = ?', [id]) === 0)
    throw new NotFoundError(`Memory ${id} not found`)
}

/** Deletes every memory of the agent. Returns how many were removed. */
export const clearMemories = (db: Db, agentId: string): number => {
  assertAgent(db, agentId)
  return run(db, 'DELETE FROM memories WHERE agent_id = ?', [agentId])
}

/** Case-insensitive substring match on content, newest first. LIKE wildcards in the query are literal. */
export const searchMemories = (db: Db, agentId: string, query: string, limit = 5): Memory[] => {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`)
  return all<MemoryRow>(
    db,
    "SELECT * FROM memories WHERE agent_id = ? AND content LIKE ? ESCAPE '\\' ORDER BY created_at DESC, rowid DESC LIMIT ?",
    [agentId, `%${escaped}%`, limit],
  ).map(toMemory)
}
