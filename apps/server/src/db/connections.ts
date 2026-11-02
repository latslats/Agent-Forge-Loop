import {
  type Connection,
  Connection as ConnectionSchema,
  type CreateConnectionBody,
  McpConfig,
  type UpdateConnectionBody,
} from '@agentforgeloop/shared'
import { z } from 'zod'
import { ConflictError, NotFoundError } from '../errors.ts'
import { all, type Db, get, newId, nowIso, run } from './sqlite.ts'

type ConnectionRow = {
  id: string
  kind: string
  name: string
  config_json: string | null
  enabled_tools_json: string
  created_at: string
}

const toConnection = (row: ConnectionRow): Connection =>
  ConnectionSchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    config: row.config_json === null ? null : McpConfig.parse(JSON.parse(row.config_json)),
    enabledTools: z.array(z.string()).parse(JSON.parse(row.enabled_tools_json)),
    createdAt: row.created_at,
  })

const rowOf = (db: Db, id: string): ConnectionRow => {
  const row = get<ConnectionRow>(db, 'SELECT * FROM connections WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Connection ${id} not found`)
  return row
}

export const listConnections = (db: Db): Connection[] =>
  all<ConnectionRow>(db, 'SELECT * FROM connections ORDER BY created_at, rowid').map(toConnection)

export const getConnection = (db: Db, id: string): Connection => toConnection(rowOf(db, id))

export const createConnection = (db: Db, body: CreateConnectionBody): Connection => {
  const id = newId()
  run(
    db,
    'INSERT INTO connections (id, kind, name, config_json, enabled_tools_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, 'mcp', body.name, JSON.stringify(body.config), '[]', nowIso()],
  )
  return getConnection(db, id)
}

/** Only the given fields change. The built-in row has no config, so it cannot take one. */
export const updateConnection = (db: Db, id: string, patch: UpdateConnectionBody): Connection => {
  const row = rowOf(db, id)
  if (patch.config !== undefined && row.kind === 'builtin')
    throw new ConflictError('the built-in connection has no config')
  run(db, 'UPDATE connections SET name = ?, config_json = ?, enabled_tools_json = ? WHERE id = ?', [
    patch.name ?? row.name,
    patch.config !== undefined ? JSON.stringify(patch.config) : row.config_json,
    patch.enabledTools !== undefined ? JSON.stringify(patch.enabledTools) : row.enabled_tools_json,
    id,
  ])
  return getConnection(db, id)
}

export const deleteConnection = (db: Db, id: string): void => {
  if (getConnection(db, id).kind === 'builtin')
    throw new ConflictError('the built-in connection cannot be deleted')
  run(db, 'DELETE FROM connections WHERE id = ?', [id])
}
