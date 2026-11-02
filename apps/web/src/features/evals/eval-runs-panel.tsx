import type { AgentWithVersions, EvalDataset } from '@agentforgeloop/shared'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useCases, useEvalRuns } from '../../api/evals.ts'
import { Card } from '../../components/ui/card.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { EvalResults } from './eval-results.tsx'
import { EvalRunList } from './eval-run-list.tsx'
import { RunEvalsForm } from './run-evals-form.tsx'

/** The right column for one dataset: start a run, list the runs, read one of them. */
export function EvalRunsPanel({
  agent,
  dataset,
}: {
  agent: AgentWithVersions
  dataset: EvalDataset
}) {
  const runs = useEvalRuns(agent.id)
  const cases = useCases(dataset.id)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (runs.isPending) return <Spinner label="Loading eval runs…" />
  if (runs.isError) {
    return <EmptyState title="Couldn't load eval runs" description={errorMessage(runs.error)} />
  }

  const datasetRuns = runs.data.filter((run) => run.datasetId === dataset.id)
  const focusId = selectedId ?? datasetRuns[0]?.id ?? null

  return (
    <>
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Run evals</h2>
        <p className="mt-1 text-xs text-muted">
          Runs every case in {dataset.name} on one version. Each case is a normal run.
        </p>
        <div className="mt-3">
          <RunEvalsForm
            agent={agent}
            datasetId={dataset.id}
            caseCount={cases.data?.length ?? 0}
            onStarted={setSelectedId}
          />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Eval runs</h2>
        <div className="mt-3">
          {datasetRuns.length === 0 ? (
            <p className="text-sm text-muted">No eval runs yet for this dataset.</p>
          ) : (
            <EvalRunList runs={datasetRuns} selectedId={focusId} onSelect={setSelectedId} />
          )}
        </div>
      </Card>

      {focusId && <EvalResults key={focusId} runId={focusId} runs={datasetRuns} />}
    </>
  )
}
