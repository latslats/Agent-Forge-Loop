import {
  AgentDefinition,
  Run,
  RunDetail,
  type RunEvent,
  type RunEventKind,
  RunEvent as RunEventSchema,
  type RunListQuery,
  type RunStatus,
  RunSummary,
  type TriggerKind,
} from '@agentforgeloop/shared'
import { type RunState, RunStateSchema } from '../engine/types.ts'
import { InvalidDefinitionError, NotFoundError } from '../errors.ts'
import { listApprovals } from './approvals.ts'
import { all, type Db, get, newId, nowIso, run, transaction } from './sqlite.ts'

type RunRow = {
  id: string
  agent_id: string
  version_id: string
  version_number: number
  trigger_kind: string
  status: string
  input_json: string
  output_json: string | null
  state_json: string | null
  tokens_in: number
  tokens_out: number
  cost_usd: number
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

type SummaryRow = RunRow & { agent_name: string }

type EventRow = {
  id: string
  run_id: string
  seq: number
  ts: string
  kind: string
  node_id: string | null
  payload_json: string
}

const SUMMARY_SQL =
  'SELECT r.*, a.name AS agent_name FROM runs r JOIN agents a ON a.id = r.agent_id'

// JSON columns come back as unknown; the shared zod schemas validate them when mapping.
const toRunFields = (row: RunRow) => ({
  id: row.id,
  agentId: row.agent_id,
  versionId: row.version_id,
  versionNumber: row.version_number,
  triggerKind: row.trigger_kind,
  status: row.status,
  input: JSON.parse(row.input_json),
  output: row.output_json === null ? null : JSON.parse(row.output_json),
  tokensIn: row.tokens_in,
  tokensOut: row.tokens_out,
  costUsd: row.cost_usd,
  error: row.error,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdAt: row.created_at,
})

const toRun = (row: RunRow): Run => Run.parse(toRunFields(row))

const toSummary = (row: SummaryRow): RunSummary =>
  RunSummary.parse({ ...toRunFields(row), agentName: row.agent_name })

const toEvent = (row: EventRow): RunEvent =>
  RunEventSchema.parse({
    id: row.id,
    runId: row.run_id,
    seq: row.seq,
    ts: row.ts,
    kind: row.kind,
    nodeId: row.node_id,
    payload: JSON.parse(row.payload_json),
  })

export type NewRun = {
  agentId: string
  versionId: string
  versionNumber: number
  triggerKind: TriggerKind
  input: unknown
  state: RunState
}

export type RunPatch = {
  status?: RunStatus
  state?: RunState
  output?: unknown
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  error?: string | null
  startedAt?: string
  finishedAt?: string
}

/** Finds the version a run will execute: the current one, or the one asked for. */
export const resolveVersion = (
  db: Db,
  agentId: string,
  versionNumber?: number,
): { id: string; number: number } => {
  const agent = get<{ current_version: number | null }>(
    db,
    'SELECT current_version FROM agents WHERE id = ?',
    [agentId],
  )
  if (!agent) throw new NotFoundError(`Agent ${agentId} not found`)
  const number = versionNumber ?? agent.current_version
  if (number === null) throw new InvalidDefinitionError(['Publish a version first'])
  const version = get<{ id: string; number: number }>(
    db,
    'SELECT id, number FROM agent_versions WHERE agent_id = ? AND number = ?',
    [agentId, number],
  )
  if (!version) throw new NotFoundError(`Version ${number} of agent ${agentId} not found`)
  return version
}

export const insertRun = (db: Db, input: NewRun): Run => {
  const id = newId()
  const now = nowIso()
  run(
    db,
    'INSERT INTO runs (id, agent_id, version_id, version_number, trigger_kind, status, input_json, output_json, state_json, tokens_in, tokens_out, cost_usd, error, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, 0, 0, NULL, NULL, NULL, ?)',
    [
      id,
      input.agentId,
      input.versionId,
      input.versionNumber,
      input.triggerKind,
      'queued',
      JSON.stringify(input.input ?? null),
      JSON.stringify(input.state),
      now,
    ],
  )
  return getRun(db, id)
}

export const getRun = (db: Db, id: string): Run => {
  const row = get<RunRow>(db, 'SELECT * FROM runs WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Run ${id} not found`)
  return toRun(row)
}

export const getRunSummary = (db: Db, id: string): RunSummary | undefined => {
  const row = get<SummaryRow>(db, `${SUMMARY_SQL} WHERE r.id = ?`, [id])
  return row ? toSummary(row) : undefined
}

export const listRuns = (db: Db, query: RunListQuery): RunSummary[] => {
  const where: string[] = []
  const params: Array<string | number> = []
  if (query.agentId !== undefined) {
    where.push('r.agent_id = ?')
    params.push(query.agentId)
  }
  if (query.status !== undefined) {
    where.push('r.status = ?')
    params.push(query.status)
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  return all<SummaryRow>(
    db,
    `${SUMMARY_SQL} ${clause} ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`,
    [...params, query.limit],
  ).map(toSummary)
}

export const listAgentRuns = (db: Db, agentId: string): RunSummary[] => {
  if (!get(db, 'SELECT id FROM agents WHERE id = ?', [agentId]))
    throw new NotFoundError(`Agent ${agentId} not found`)
  return listRuns(db, { agentId, limit: 50 })
}

export const listEvents = (db: Db, runId: string): RunEvent[] =>
  all<EventRow>(db, 'SELECT * FROM run_events WHERE run_id = ? ORDER BY seq', [runId]).map(toEvent)

/** Appends an event with the next seq for its run. Single-threaded, so MAX+1 cannot race. */
export const appendEvent = (
  db: Db,
  runId: string,
  kind: RunEventKind,
  nodeId: string | null,
  payload: Record<string, unknown>,
): RunEvent => {
  const last = get<{ seq: number }>(
    db,
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM run_events WHERE run_id = ?',
    [runId],
  )
  const event: RunEvent = {
    id: newId(),
    runId,
    seq: (last?.seq ?? 0) + 1,
    ts: nowIso(),
    kind,
    nodeId,
    payload,
  }
  run(
    db,
    'INSERT INTO run_events (id, run_id, seq, ts, kind, node_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [event.id, runId, event.seq, event.ts, kind, nodeId, JSON.stringify(payload)],
  )
  return event
}

export const getRunDetail = (db: Db, id: string): RunDetail => {
  const summary = getRunSummary(db, id)
  if (!summary) throw new NotFoundError(`Run ${id} not found`)
  return RunDetail.parse({
    ...summary,
    events: listEvents(db, id),
    approvals: listApprovals(db, id),
  })
}

/** Only the fields that are given change. */
export const updateRun = (db: Db, id: string, patch: RunPatch): void => {
  const columns: Array<[string, string | number | null]> = []
  if (patch.status !== undefined) columns.push(['status', patch.status])
  if (patch.state !== undefined) columns.push(['state_json', JSON.stringify(patch.state)])
  if (patch.output !== undefined) columns.push(['output_json', JSON.stringify(patch.output)])
  if (patch.tokensIn !== undefined) columns.push(['tokens_in', patch.tokensIn])
  if (patch.tokensOut !== undefined) columns.push(['tokens_out', patch.tokensOut])
  if (patch.costUsd !== undefined) columns.push(['cost_usd', patch.costUsd])
  if (patch.error !== undefined) columns.push(['error', patch.error])
  if (patch.startedAt !== undefined) columns.push(['started_at', patch.startedAt])
  if (patch.finishedAt !== undefined) columns.push(['finished_at', patch.finishedAt])
  if (columns.length === 0) return
  const assignments = columns.map(([column]) => `${column} = ?`).join(', ')
  run(db, `UPDATE runs SET ${assignments} WHERE id = ?`, [...columns.map(([, value]) => value), id])
}

/** The run, the definition of its version, and the parsed state. */
export const loadRun = (
  db: Db,
  id: string,
): { run: Run; definition: AgentDefinition; state: RunState } => {
  const row = get<RunRow & { definition_json: string }>(
    db,
    'SELECT r.*, v.definition_json FROM runs r JOIN agent_versions v ON v.id = r.version_id WHERE r.id = ?',
    [id],
  )
  if (!row) throw new NotFoundError(`Run ${id} not found`)
  return {
    run: toRun(row),
    definition: AgentDefinition.parse(JSON.parse(row.definition_json)),
    state: RunStateSchema.parse(JSON.parse(row.state_json ?? 'null')),
  }
}

/** Marks queued and running runs as failed after a restart. Returns them as they now are. */
export const failInterruptedRuns = (db: Db): Run[] =>
  transaction(db, () => {
    const ids = all<{ id: string }>(
      db,
      "SELECT id FROM runs WHERE status IN ('queued', 'running')",
    ).map((row) => row.id)
    run(
      db,
      "UPDATE runs SET status = 'failed', error = 'interrupted by restart', finished_at = ? WHERE status IN ('queued', 'running')",
      [nowIso()],
    )
    return ids.map((id) => getRun(db, id))
  })
