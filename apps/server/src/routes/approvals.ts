import { type ApprovalDecision, ApprovalDecisionBody } from '@agentforgeloop/shared'
import { type Context, Hono } from 'hono'
import { listPendingApprovals } from '../db/approvals.ts'
import { decideApproval } from '../engine/approvals.ts'
import type { EngineDeps } from '../engine/types.ts'
import { readJson } from './read-json.ts'

export const approvalRoutes = (deps: EngineDeps) => {
  const api = new Hono()

  const decide = async (
    c: Context,
    runId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ) => {
    const { note } = ApprovalDecisionBody.parse(await readJson(c))
    return c.json(decideApproval(deps, runId, approvalId, decision, note))
  }

  api.get('/approvals', (c) => c.json(listPendingApprovals(deps.db)))

  api.post('/runs/:runId/approvals/:approvalId/approve', (c) =>
    decide(c, c.req.param('runId'), c.req.param('approvalId'), 'approve'),
  )
  api.post('/runs/:runId/approvals/:approvalId/reject', (c) =>
    decide(c, c.req.param('runId'), c.req.param('approvalId'), 'reject'),
  )

  return api
}
