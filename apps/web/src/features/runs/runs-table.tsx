import type { RunSummary } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { money, timeAgo } from '../../lib/format.ts'
import { durationLabel, runDurationMs, TRIGGER_LABELS } from './run-format.ts'
import { RunStatusBadge } from './run-status-badge.tsx'

/** Runs as a table; each row's status links to the run page. Shared by an agent and the Runs page. */
export function RunsTable({
  runs,
  showAgent = false,
}: {
  runs: RunSummary[]
  showAgent?: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-surface border border-line bg-panel">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
            {showAgent && (
              <th scope="col" className="px-3 py-2 font-medium">
                Agent
              </th>
            )}
            <th scope="col" className="px-3 py-2 font-medium">
              Trigger
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Version
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Cost
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Duration
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Started
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const duration = runDurationMs(run)
            return (
              <tr key={run.id} className="border-b border-line last:border-b-0 hover:bg-sunken">
                <td className="px-3 py-2">
                  <Link to={`/runs/${run.id}`} className="inline-flex">
                    <RunStatusBadge status={run.status} />
                  </Link>
                </td>
                {showAgent && <td className="px-3 py-2 font-medium">{run.agentName}</td>}
                <td className="px-3 py-2 text-muted">{TRIGGER_LABELS[run.triggerKind]}</td>
                <td className="px-3 py-2 text-muted tabular-nums">v{run.versionNumber}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(run.costUsd)}</td>
                <td className="px-3 py-2 text-right text-muted tabular-nums">
                  {duration === null ? '—' : durationLabel(duration)}
                </td>
                <td className="px-3 py-2 text-muted">
                  <time dateTime={run.createdAt}>{timeAgo(run.startedAt ?? run.createdAt)}</time>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
