import {
  AgentDefinition,
  Approval,
  type ApprovalStatus,
  PendingApproval,
} from '@agentforgeloop/shared'
import { render } from '../engine/template.ts'
import { RunStateSchema } from '../engine/types.ts'
import { NotFoundError } from '../errors.ts'
import { all, type Db, get, newId, nowIso, run } from './sqlite.ts'

type ApprovalRow = {
  id: string
  run_id: string
  node_id: string
  status: string
  note: string | null
  requested_at: string
  resolved_at: string | null
}

type PendingRow = ApprovalRow & {
  agent_id: string
  agent_name: string
  definition_json: string
  state_json: string
}

const toApproval = (row: ApprovalRow): Approval =>
  Approval.parse({
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    status: row.status,
    note: row.note,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
  })

const toPending = (row: PendingRow): PendingApproval => {
  const definition = AgentDefinition.parse(JSON.parse(row.definition_json))
  const node = definition.nodes.find((candidate) => candidate.id === row.node_id)
  // Rendered with the run's saved state, as the approval_requested event was.
  const state = RunStateSchema.parse(JSON.parse(row.state_json))
  return PendingApproval.parse({
    ...toApproval(row),
    agentId: row.agent_id,
    agentName: row.agent_name,
    message: node?.type === 'approval' ? render(node.message, state) : '',
  })
}

export const createApproval = (db: Db, runId: string, nodeId: string): Approval => {
  const id = newId()
  run(
    db,
    "INSERT INTO approvals (id, run_id, node_id, status, note, requested_at, resolved_at) VALUES (?, ?, ?, 'pending', NULL, ?, NULL)",
    [id, runId, nodeId, nowIso()],
  )
  return getApproval(db, id)
}

export const getApproval = (db: Db, id: string): Approval => {
  const row = get<ApprovalRow>(db, 'SELECT * FROM approvals WHERE id = ?', [id])
  if (!row) throw new NotFoundError(`Approval ${id} not found`)
  return toApproval(row)
}

export const listApprovals = (db: Db, runId: string): Approval[] =>
  all<ApprovalRow>(db, 'SELECT * FROM approvals WHERE run_id = ? ORDER BY requested_at, rowid', [
    runId,
  ]).map(toApproval)

/** Pending approvals across all agents, oldest first. */
export const listPendingApprovals = (db: Db): PendingApproval[] =>
  all<PendingRow>(
    db,
    `SELECT a.*, r.agent_id AS agent_id, r.state_json, g.name AS agent_name, v.definition_json
       FROM approvals a
       JOIN runs r ON r.id = a.run_id
       JOIN agents g ON g.id = r.agent_id
       JOIN agent_versions v ON v.id = r.version_id
      WHERE a.status = 'pending'
      ORDER BY a.requested_at, a.rowid`,
  ).map(toPending)

/** Only a pending approval changes; a decided one is returned as it is. */
export const decideApproval = (
  db: Db,
  id: string,
  status: Exclude<ApprovalStatus, 'pending'>,
  note: string,
): Approval => {
  const current = getApproval(db, id)
  if (current.status !== 'pending') return current
  run(db, 'UPDATE approvals SET status = ?, note = ?, resolved_at = ? WHERE id = ?', [
    status,
    note,
    nowIso(),
    id,
  ])
  return getApproval(db, id)
}

/** A run cancelled while it waits will never decide its approval, so the approval expires. */
export const expirePendingApprovals = (db: Db, runId: string): void => {
  run(
    db,
    "UPDATE approvals SET status = 'expired', resolved_at = ? WHERE run_id = ? AND status = 'pending'",
    [nowIso(), runId],
  )
}

/** A pending approval whose node set timeoutMinutes and whose wait has run out. */
export type DueApproval = {
  id: string
  runId: string
  nodeId: string
  onTimeout: 'fail' | 'approve'
}

/** Pending approvals waiting longer than their node's timeoutMinutes at `now`. */
export const dueApprovals = (db: Db, now: Date): DueApproval[] =>
  all<ApprovalRow & { definition_json: string }>(
    db,
    `SELECT a.*, v.definition_json
       FROM approvals a
       JOIN runs r ON r.id = a.run_id
       JOIN agent_versions v ON v.id = r.version_id
      WHERE a.status = 'pending'`,
  ).flatMap((row) => {
    const definition = AgentDefinition.parse(JSON.parse(row.definition_json))
    const node = definition.nodes.find((candidate) => candidate.id === row.node_id)
    if (node?.type !== 'approval' || node.timeoutMinutes === undefined) return []
    const deadline = Date.parse(row.requested_at) + node.timeoutMinutes * 60_000
    if (deadline > now.getTime()) return []
    return [{ id: row.id, runId: row.run_id, nodeId: row.node_id, onTimeout: node.onTimeout }]
  })

/** Marks a pending approval expired. Returns false when it was already decided. */
export const expireApproval = (db: Db, id: string): boolean =>
  run(
    db,
    "UPDATE approvals SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'pending'",
    [nowIso(), id],
  ) > 0
