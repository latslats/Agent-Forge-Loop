import { errorMessage, useAgentRuns } from '../../api/client.ts'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { RunsTable } from './runs-table.tsx'

/** The Runs tab of an agent. Refetched when the run console finishes a run. */
export function RunsTab({ agentId }: { agentId: string }) {
  const runs = useAgentRuns(agentId)

  if (runs.isPending) return <Spinner label="Loading runs…" />

  if (runs.isError) {
    return <EmptyState title="Couldn't load runs" description={errorMessage(runs.error)} />
  }

  if (runs.data.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Each run of this agent will appear here with its steps and cost."
      />
    )
  }

  return <RunsTable runs={runs.data} />
}
