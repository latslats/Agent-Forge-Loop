import {
  Agent,
  type AgentDefinition,
  AgentVersion,
  type AgentWithVersions,
  type CreateAgentBody,
  defaultDefinition,
  type UpdateAgentBody,
  validateDefinition,
} from '@agentforgeloop/shared'
import { InvalidDefinitionError, NotFoundError } from '../errors.ts'
import { all, type Db, get, newId, nowIso, run, transaction } from './sqlite.ts'

type AgentRow = {
  id: string
  name: string
  description: string
  status: string
  current_version: number | null
  draft_json: string
  created_at: string
  updated_at: string
}

type VersionRow = {
  id: string
  agent_id: string
  number: number
  definition_json: string
  note: string
  created_at: string
}

// JSON columns come back as unknown; the shared zod schemas validate them when mapping.
const parseJson = (text: string): unknown => JSON.parse(text)

const toAgent = (row: AgentRow): Agent =>
  Agent.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    currentVersion: row.current_version,
    draft: parseJson(row.draft_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

const toVersion = (row: VersionRow): AgentVersion =>
  AgentVersion.parse({
    id: row.id,
    agentId: row.agent_id,
    number: row.number,
    definition: parseJson(row.definition_json),
    note: row.note,
    createdAt: row.created_at,
  })

const agentNotFound = (id: string): NotFoundError => new NotFoundError(`Agent ${id} not found`)

const assertValidDefinition = (def: AgentDefinition): void => {
  const problems = validateDefinition(def)
  if (problems.length > 0) throw new InvalidDefinitionError(problems)
}

export const listAgents = (db: Db): Agent[] =>
  all<AgentRow>(db, 'SELECT * FROM agents ORDER BY created_at DESC').map(toAgent)

export const getAgent = (db: Db, id: string): Agent => {
  const row = get<AgentRow>(db, 'SELECT * FROM agents WHERE id = ?', [id])
  if (!row) throw agentNotFound(id)
  return toAgent(row)
}

export const listVersions = (db: Db, agentId: string): AgentVersion[] => {
  getAgent(db, agentId)
  return all<VersionRow>(db, 'SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY number', [
    agentId,
  ]).map(toVersion)
}

export const getAgentWithVersions = (db: Db, id: string): AgentWithVersions => ({
  ...getAgent(db, id),
  versions: listVersions(db, id),
})

export const createAgent = (db: Db, body: CreateAgentBody): Agent => {
  const id = newId()
  const now = nowIso()
  // name and description are stored on the row and in the draft; both copies come from here.
  const draft = {
    ...(body.draft ?? defaultDefinition(body.name)),
    name: body.name,
    description: body.description,
  }
  assertValidDefinition(draft)
  run(
    db,
    'INSERT INTO agents (id, name, description, status, current_version, draft_json, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)',
    [id, body.name, body.description, 'draft', JSON.stringify(draft), now, now],
  )
  return getAgent(db, id)
}

export const updateAgent = (db: Db, id: string, patch: UpdateAgentBody): Agent => {
  if (patch.draft) assertValidDefinition(patch.draft)
  const current = getAgent(db, id)
  // A draft edit carries its description, so the row takes it unless the patch sets one.
  const name = patch.name ?? current.name
  const description = patch.description ?? patch.draft?.description ?? current.description
  const draft = { ...(patch.draft ?? current.draft), name, description }
  run(
    db,
    'UPDATE agents SET name = ?, description = ?, status = ?, draft_json = ?, updated_at = ? WHERE id = ?',
    [name, description, patch.status ?? current.status, JSON.stringify(draft), nowIso(), id],
  )
  return getAgent(db, id)
}

export const deleteAgent = (db: Db, id: string): void => {
  if (run(db, 'DELETE FROM agents WHERE id = ?', [id]) === 0) throw agentNotFound(id)
}

export const publishVersion = (db: Db, agentId: string, note: string): AgentVersion =>
  transaction(db, () => {
    const agent = getAgent(db, agentId)
    const version: AgentVersion = {
      id: newId(),
      agentId,
      number: (agent.currentVersion ?? 0) + 1,
      definition: agent.draft,
      note,
      createdAt: nowIso(),
    }
    run(
      db,
      'INSERT INTO agent_versions (id, agent_id, number, definition_json, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        version.id,
        agentId,
        version.number,
        JSON.stringify(version.definition),
        note,
        version.createdAt,
      ],
    )
    run(db, 'UPDATE agents SET status = ?, current_version = ?, updated_at = ? WHERE id = ?', [
      agent.status === 'draft' ? 'active' : agent.status,
      version.number,
      version.createdAt,
      agentId,
    ])
    return version
  })
