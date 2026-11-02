import type { EvalRun } from '@agentforgeloop/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { useEvalRun } from '../../api/evals.ts'
import { Card } from '../../components/ui/card.tsx'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Select } from '../../components/ui/select.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { timeAgo } from '../../lib/format.ts'
import { CompareView } from './compare-view.tsx'
import { EvalStatusBadge } from './eval-status-badge.tsx'
import { ResultsTable } from './results-table.tsx'
import { SummaryTiles } from './summary-tiles.tsx'

const NO_COMPARE = 'none'

/** One eval run in full, with an optional second run to compare it against. */
export function EvalResults({ runId, runs }: { runId: string; runs: EvalRun[] }) {
  const detail = useEvalRun(runId)
  const [compareId, setCompareId] = useState<string | null>(null)

  if (detail.isPending) {
    return (
      <Card className="p-4">
        <Spinner label="Loading results…" />
      </Card>
    )
  }
  if (detail.isError) {
    return (
      <Card className="p-4">
        <EmptyState title="Couldn't load results" description={errorMessage(detail.error)} />
      </Card>
    )
  }

  const run = detail.data
  if (run.status === 'queued' || run.status === 'running') {
    return (
      <Card className="p-4">
        <Spinner label={`Running the eval on v${run.versionNumber}…`} />
      </Card>
    )
  }
  if (run.status === 'failed' || run.summary === null) {
    return (
      <Card className="p-4">
        <EmptyState
          title="This eval run failed"
          description="The server logged the error. Check its output, then run the eval again."
        />
      </Card>
    )
  }

  const others = runs.filter((other) => other.id !== run.id && other.status === 'succeeded')
  const compareWith = others.find((other) => other.id === compareId) ?? null

  return (
    <Card className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            v{run.versionNumber} on {run.datasetName}
          </h2>
          <p className="text-xs text-muted">
            <time dateTime={run.createdAt}>{timeAgo(run.createdAt)}</time>
          </p>
        </div>
        <EvalStatusBadge status={run.status} />
        {others.length > 0 && (
          <div className="w-56">
            <Field label="Compare with…" htmlFor="compare-with">
              <Select
                id="compare-with"
                value={compareWith?.id ?? NO_COMPARE}
                onValueChange={(value) => setCompareId(value === NO_COMPARE ? null : value)}
                options={[
                  { value: NO_COMPARE, label: 'None' },
                  ...others.map((other) => ({
                    value: other.id,
                    label: `v${other.versionNumber} · ${timeAgo(other.createdAt)}`,
                  })),
                ]}
              />
            </Field>
          </div>
        )}
      </header>

      {compareWith ? (
        <CompareView left={run} rightId={compareWith.id} />
      ) : (
        <>
          <SummaryTiles summary={run.summary} />
          {run.results.length === 0 ? (
            <EmptyState title="No results" description="This run has no cases to show." />
          ) : (
            <ResultsTable results={run.results} />
          )}
        </>
      )}
      <p className="text-xs text-muted">
        Each case is a normal run.{' '}
        <Link to="/runs" className="text-accent-ink hover:underline">
          See all runs
        </Link>
      </p>
    </Card>
  )
}
