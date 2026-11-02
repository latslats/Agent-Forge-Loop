import type { EvalRun } from '@agentforgeloop/shared'
import { money, timeAgo } from '../../lib/format.ts'
import { durationLabel } from '../runs/run-format.ts'
import { percent } from './eval-format.ts'
import { EvalStatusBadge } from './eval-status-badge.tsx'

/** Eval runs of one dataset, newest first. The version button selects a run to read. */
export function EvalRunList({
  runs,
  selectedId,
  onSelect,
}: {
  runs: EvalRun[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Version
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Pass rate
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Mean cost
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              p50 latency
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Started
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const summary = run.summary
            const selected = run.id === selectedId
            return (
              <tr
                key={run.id}
                className={
                  selected
                    ? 'border-b border-line bg-accent-soft last:border-b-0'
                    : 'border-b border-line last:border-b-0 hover:bg-sunken'
                }
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(run.id)}
                    className="cursor-pointer font-medium tabular-nums hover:text-accent-ink"
                  >
                    v{run.versionNumber}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <EvalStatusBadge status={run.status} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {summary
                    ? `${percent(summary.passRate)} (${summary.passed}/${summary.total})`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {summary ? money(summary.meanCostUsd) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {summary ? durationLabel(summary.p50LatencyMs) : '—'}
                </td>
                <td className="px-3 py-2 text-muted">
                  <time dateTime={run.createdAt}>{timeAgo(run.createdAt)}</time>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
