import { useNavigate, useParams } from 'react-router'
import { errorMessage, useRun } from '../api/client.ts'
import { Button } from '../components/ui/button.tsx'
import { EmptyState } from '../components/ui/empty-state.tsx'
import { Spinner } from '../components/ui/spinner.tsx'
import { RunDetailView } from '../features/runs/run-detail-view.tsx'

export function RunPage() {
  const id = useParams().id ?? ''
  const run = useRun(id)
  const navigate = useNavigate()

  if (run.isPending) {
    return (
      <div className="p-6">
        <Spinner label="Loading run…" />
      </div>
    )
  }

  if (run.isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Couldn't load this run"
          description={errorMessage(run.error)}
          action={
            <Button variant="secondary" onClick={() => navigate('/runs')}>
              Back to runs
            </Button>
          }
        />
      </div>
    )
  }

  return <RunDetailView run={run.data} />
}
