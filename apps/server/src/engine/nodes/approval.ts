import type { ApprovalNode } from '@agentforgeloop/shared'
import { createApproval } from '../../db/approvals.ts'
import { getRun } from '../../db/runs.ts'
import { render } from '../template.ts'
import type { NodeHandler } from '../types.ts'

/** Records the request and pauses the run. The executor saves the state as waiting_approval. */
export const runApprovalNode: NodeHandler<ApprovalNode> = async (node, state, io) => {
  // Eval runs have no reviewer, so the approval passes and the run goes on.
  if (getRun(io.deps.db, io.runId).triggerKind === 'eval') {
    io.emit('log', node.id, { message: 'Approval auto-passed in eval run' })
    return { type: 'next' }
  }
  const approval = createApproval(io.deps.db, io.runId, node.id)
  io.emit('approval_requested', node.id, {
    approvalId: approval.id,
    message: render(node.message, state),
  })
  return { type: 'wait', approvalId: approval.id }
}
