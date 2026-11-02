import type { AgentWithVersions } from '@agentforgeloop/shared'
import { useState } from 'react'
import { errorMessage } from '../../api/client.ts'
import { useDatasets } from '../../api/evals.ts'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { CasesPanel } from './cases-panel.tsx'
import { DatasetsPanel } from './datasets-panel.tsx'
import { EvalRunsPanel } from './eval-runs-panel.tsx'

/** The Evals tab: datasets and their cases on the left, runs and their results on the right. */
export function EvalsTab({ agent }: { agent: AgentWithVersions }) {
  const datasets = useDatasets(agent.id)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (datasets.isPending) return <Spinner label="Loading datasets…" />
  if (datasets.isError) {
    return <EmptyState title="Couldn't load datasets" description={errorMessage(datasets.error)} />
  }

  // A deleted or unknown selection falls back to the first dataset.
  const dataset = datasets.data.find((item) => item.id === selectedId) ?? datasets.data[0]

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <DatasetsPanel
          agentId={agent.id}
          datasets={datasets.data}
          selectedId={dataset?.id ?? null}
          onSelect={setSelectedId}
        />
        {dataset && <CasesPanel key={dataset.id} dataset={dataset} />}
      </div>
      <div className="min-w-0 space-y-6">
        {dataset ? (
          <EvalRunsPanel key={dataset.id} agent={agent} dataset={dataset} />
        ) : (
          <EmptyState
            title="Create a dataset to run evals"
            description="Evals run the agent's cases and report pass rate, cost and latency."
          />
        )}
      </div>
    </div>
  )
}
