import type { ApprovalDecision, RunDetail } from '@agentforgeloop/shared'
import {
  type DueApproval,
  expireApproval,
  getApproval,
  decideApproval as recordDecision,
} from '../db/approvals.ts'
import { getRun, getRunDetail, loadRun } from '../db/runs.ts'
import { nowIso } from '../db/sqlite.ts'
import { ConflictError, NotFoundError } from '../errors.ts'
import { emitEvent, finish, resumeRun, waitedMs } from './executor.ts'
import type { EngineDeps } from './types.ts'

// The decisions on a waiting run: reject, approve (resume) and time out. Split from executor.ts,
// which keeps the walk and the run lifecycle.

/** Ends a run that waits on an approval as failed, because the reviewer rejected it. */
export const rejectRun = (deps: EngineDeps, runId: string, error: string): void => {
  const { run, definition, state } = loadRun(deps.db, runId)
  emitEvent(deps, runId, 'error', state.nodeId, { message: error })
  emitEvent(deps, runId, 'node_end', state.nodeId, {
    status: 'failed',
    durationMs: waitedMs(deps, runId, state.nodeId),
  })
  finish(
    deps,
    {
      runId,
      definition,
      state,
      startedAt: run.startedAt ?? nowIso(),
      controller: new AbortController(),
    },
    'failed',
    error,
  )
}

/**
 * Records a reviewer's decision on a pending approval, then resumes the run (approve) or fails it
 * (reject). Throws NotFoundError or ConflictError for a decision that does not fit the run.
 */
export const decideApproval = (
  deps: EngineDeps,
  runId: string,
  approvalId: string,
  decision: ApprovalDecision,
  note: string,
): RunDetail => {
  const approval = getApproval(deps.db, approvalId)
  if (approval.runId !== runId) throw new NotFoundError(`Approval ${approvalId} not found`)
  if (approval.status !== 'pending') throw new ConflictError('approval already decided')
  if (getRun(deps.db, runId).status !== 'waiting_approval')
    throw new ConflictError('run is not waiting for approval')

  if (decision === 'approve') {
    recordDecision(deps.db, approvalId, 'approved', note)
    emitEvent(deps, runId, 'approval_resolved', approval.nodeId, {
      approvalId,
      status: 'approved',
    })
    // Not awaited: the resume marks the run running before it returns, and the rest runs in the background.
    resumeRun(deps, runId).catch((err: unknown) => console.error(err))
  } else {
    recordDecision(deps.db, approvalId, 'rejected', note)
    emitEvent(deps, runId, 'approval_resolved', approval.nodeId, {
      approvalId,
      status: 'rejected',
    })
    rejectRun(deps, runId, note ? `Rejected by reviewer: ${note}` : 'Rejected by reviewer')
  }
  return getRunDetail(deps.db, runId)
}

/**
 * Applies an approval's timeout: 'fail' ends the run as failed, 'approve' resumes it past the
 * approval. Returns false when the approval was already decided or expired.
 */
export const timeOutApproval = (deps: EngineDeps, due: DueApproval): boolean => {
  if (!expireApproval(deps.db, due.id)) return false
  emitEvent(deps, due.runId, 'approval_resolved', due.nodeId, {
    approvalId: due.id,
    status: 'expired',
  })
  if (due.onTimeout === 'approve') {
    resumeRun(deps, due.runId).catch((err: unknown) => console.error(err))
  } else {
    rejectRun(deps, due.runId, 'Approval timed out')
  }
  return true
}
