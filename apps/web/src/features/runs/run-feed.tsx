import type { RunEvent } from '@agentforgeloop/shared'
import { ApprovalActions } from './approval-actions.tsx'
import { EventRow, resolvedApprovalIds } from './run-event.tsx'

/** The live feed of the run console: one row per event, approvals with their buttons. */
export function RunFeed({
  runId,
  events,
  labels,
}: {
  runId: string
  events: RunEvent[]
  labels: ReadonlyMap<string, string>
}) {
  const resolved = resolvedApprovalIds(events)
  return (
    <ol className="space-y-0.5">
      {events.map((event) => {
        const approvalId = approvalIdOf(event)
        return (
          <EventRow
            key={event.id}
            event={event}
            labels={labels}
            showRaw={event.kind === 'tool_call' || event.kind === 'tool_result'}
          >
            {approvalId !== null && !resolved.has(approvalId) && (
              <ApprovalActions runId={runId} approvalId={approvalId} />
            )}
          </EventRow>
        )
      })}
    </ol>
  )
}

function approvalIdOf(event: RunEvent): string | null {
  if (event.kind !== 'approval_requested') return null
  const id = event.payload.approvalId
  return typeof id === 'string' ? id : null
}
