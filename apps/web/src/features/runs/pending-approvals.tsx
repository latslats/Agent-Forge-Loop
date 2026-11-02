import type { PendingApproval } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { Card } from '../../components/ui/card.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { timeAgo } from '../../lib/format.ts'
import { ApprovalActions } from './approval-actions.tsx'

/** The approval queue across all agents, oldest first. */
export function PendingApprovals({ approvals }: { approvals: PendingApproval[] }) {
  if (approvals.length === 0) {
    return (
      <EmptyState
        title="Nothing needs approval"
        description="Approval steps that pause a run will wait here for a decision."
      />
    )
  }

  return (
    <ul className="space-y-3">
      {approvals.map((approval) => (
        <li key={approval.id}>
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <Link
                to={`/agents/${approval.agentId}`}
                className="font-medium text-ink hover:underline"
              >
                {approval.agentName}
              </Link>
              <span>
                Requested{' '}
                <time dateTime={approval.requestedAt}>{timeAgo(approval.requestedAt)}</time>
                {' · '}
                <Link to={`/runs/${approval.runId}`} className="hover:underline">
                  View run
                </Link>
              </span>
            </div>
            <p className="text-sm break-words">{approval.message}</p>
            <ApprovalActions runId={approval.runId} approvalId={approval.id} />
          </Card>
        </li>
      ))}
    </ul>
  )
}
