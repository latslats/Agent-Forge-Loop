import { RunStatus } from '@agentforgeloop/shared'
import { useState } from 'react'
import { errorMessage, usePendingApprovals, useRuns } from '../api/client.ts'
import { PageHeader } from '../components/layout/page-header.tsx'
import { EmptyState } from '../components/ui/empty-state.tsx'
import { Select } from '../components/ui/select.tsx'
import { Spinner } from '../components/ui/spinner.tsx'
import { PendingApprovals } from '../features/runs/pending-approvals.tsx'
import { RUN_STATUS_LABELS } from '../features/runs/run-format.ts'
import { RunsTable } from '../features/runs/runs-table.tsx'

const ALL = 'all'

const STATUS_OPTIONS = [
  { value: ALL, label: 'All statuses' },
  ...RunStatus.options.map((status) => ({ value: status, label: RUN_STATUS_LABELS[status] })),
]

export function RunsPage() {
  const [status, setStatus] = useState(ALL)
  const approvals = usePendingApprovals()
  const parsed = RunStatus.safeParse(status)
  const runs = useRuns(parsed.success ? { status: parsed.data } : {})

  return (
    <>
      <PageHeader
        title="Runs"
        description="Every run across your agents, including approvals waiting on you."
      />
      <div className="space-y-8 p-6">
        <section aria-labelledby="approvals-heading" className="space-y-3">
          <h2 id="approvals-heading" className="text-sm font-semibold">
            Needs approval
          </h2>
          {approvals.isPending && <Spinner label="Loading approvals…" />}
          {approvals.isError && (
            <EmptyState
              title="Couldn't load approvals"
              description={errorMessage(approvals.error)}
            />
          )}
          {approvals.data && <PendingApprovals approvals={approvals.data} />}
        </section>

        <section aria-labelledby="all-runs-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="all-runs-heading" className="text-sm font-semibold">
              All runs
            </h2>
            <div className="w-48">
              <Select
                id="run-status-filter"
                aria-label="Filter runs by status"
                value={status}
                onValueChange={setStatus}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
          {runs.isPending && <Spinner label="Loading runs…" />}
          {runs.isError && (
            <EmptyState title="Couldn't load runs" description={errorMessage(runs.error)} />
          )}
          {runs.data && runs.data.length === 0 && (
            <EmptyState
              title={parsed.success ? 'No runs with this status' : 'No runs yet'}
              description={
                parsed.success
                  ? 'Pick another status to see more runs.'
                  : 'Runs from all agents will appear here once an agent has run.'
              }
            />
          )}
          {runs.data && runs.data.length > 0 && <RunsTable runs={runs.data} showAgent />}
        </section>
      </div>
    </>
  )
}
