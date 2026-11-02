import type { ApprovalDecision } from '@agentforgeloop/shared'
import { useState } from 'react'
import { errorMessage, useDecideApproval } from '../../api/client.ts'
import { Button } from '../../components/ui/button.tsx'
import { Input } from '../../components/ui/input.tsx'

/** Approve or Reject one pending approval, with an optional note. Used wherever approvals show. */
export function ApprovalActions({ runId, approvalId }: { runId: string; approvalId: string }) {
  const [note, setNote] = useState('')
  const decide = useDecideApproval()

  const send = (decision: ApprovalDecision) =>
    decide.mutate({ runId, approvalId, decision, note: note.trim() })

  return (
    <div className="space-y-2">
      <Input
        aria-label="Approval note"
        placeholder="Optional note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => send('approve')}
          disabled={decide.isPending}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => send('reject')}
          disabled={decide.isPending}
        >
          Reject
        </Button>
      </div>
      {decide.isError && (
        <p role="alert" className="text-xs text-danger">
          {errorMessage(decide.error)}
        </p>
      )}
    </div>
  )
}
