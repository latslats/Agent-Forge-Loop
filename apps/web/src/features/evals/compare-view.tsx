import type { EvalCaseResult, EvalRunDetail } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { errorMessage } from '../../api/client.ts'
import { useEvalRun } from '../../api/evals.ts'
import { EmptyState } from '../../components/ui/empty-state.tsx'
import { Spinner } from '../../components/ui/spinner.tsx'
import { money } from '../../lib/format.ts'
import { durationLabel } from '../runs/run-format.ts'
import { percent, signedMs, signedPoints, signedUsd } from './eval-format.ts'
import { PassMark } from './pass-mark.tsx'
import { Stat } from './stat.tsx'

/** One side of a case: its verdict, cost, latency and a link to the run. */
function SideCell({ result }: { result: EvalCaseResult | undefined }) {
  if (!result) return <span className="text-muted">—</span>
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <PassMark pass={result.pass} />
      <span className="text-xs text-muted tabular-nums">
        {money(result.costUsd)} · {durationLabel(result.latencyMs)}
      </span>
      <Link to={`/runs/${result.runId}`} className="text-xs text-accent-ink hover:underline">
        Open run
      </Link>
    </div>
  )
}

/** Two eval runs side by side: summary deltas first, then each case on both sides. */
export function CompareView({ left, rightId }: { left: EvalRunDetail; rightId: string }) {
  const right = useEvalRun(rightId)

  if (right.isPending) return <Spinner label="Loading the other run…" />
  if (right.isError) {
    return (
      <EmptyState title="Couldn't load the other run" description={errorMessage(right.error)} />
    )
  }

  const other = right.data
  if (other.summary === null || other.status !== 'succeeded') {
    return <EmptyState title="That run has no results" description="Pick another run to compare." />
  }

  const leftSummary = left.summary
  const rightSummary = other.summary
  if (!leftSummary) return null

  const leftByCase = new Map(left.results.map((result) => [result.caseId, result]))
  const rightByCase = new Map(other.results.map((result) => [result.caseId, result]))
  const caseIds = [...new Set([...leftByCase.keys(), ...rightByCase.keys()])]

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat
          label="Pass rate"
          value={percent(rightSummary.passRate)}
          detail={`${signedPoints(rightSummary.passRate - leftSummary.passRate)} · was ${percent(leftSummary.passRate)}`}
        />
        <Stat
          label="Mean cost"
          value={money(rightSummary.meanCostUsd)}
          detail={`${signedUsd(rightSummary.meanCostUsd - leftSummary.meanCostUsd)} · was ${money(leftSummary.meanCostUsd)}`}
        />
        <Stat
          label="p50 latency"
          value={durationLabel(rightSummary.p50LatencyMs)}
          detail={`${signedMs(rightSummary.p50LatencyMs - leftSummary.p50LatencyMs)} · was ${durationLabel(leftSummary.p50LatencyMs)}`}
        />
      </dl>

      <div className="overflow-x-auto rounded-control border border-line">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Case
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                v{left.versionNumber}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                v{other.versionNumber}
              </th>
            </tr>
          </thead>
          <tbody>
            {caseIds.map((caseId) => {
              const name = leftByCase.get(caseId)?.caseName ?? rightByCase.get(caseId)?.caseName
              return (
                <tr key={caseId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 font-medium">{name}</td>
                  <td className="px-3 py-2">
                    <SideCell result={leftByCase.get(caseId)} />
                  </td>
                  <td className="px-3 py-2">
                    <SideCell result={rightByCase.get(caseId)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
