import type { EvalCaseResult, ScoreResult } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { money } from '../../lib/format.ts'
import { durationLabel } from '../runs/run-format.ts'
import { PassMark } from './pass-mark.tsx'
import { scorerKindLabel } from './scorer-builder.ts'

/** One scorer's verdict. The reason is shown under a failed chip, so keyboard users can read it. */
export function ScoreChip({ score }: { score: ScoreResult }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-control border px-2 text-xs whitespace-nowrap',
        score.pass ? 'border-line text-ink' : 'border-danger/40 text-danger',
      )}
    >
      {scorerKindLabel(score.kind)}
      <span aria-hidden="true" className={score.pass ? 'text-active' : 'text-danger'}>
        {score.pass ? '✓' : '✗'}
      </span>
      <span className="sr-only">{score.pass ? 'passed' : 'failed'}</span>
    </span>
  )
}

/** Per case: pass or fail, one chip per scorer, cost, latency and the run it came from. */
export function ResultsTable({ results }: { results: EvalCaseResult[] }) {
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Case
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Result
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Scorers
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Cost
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Latency
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              <span className="sr-only">Run</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.id} className="border-b border-line last:border-b-0 hover:bg-sunken">
              <td className="px-3 py-2 font-medium">{result.caseName}</td>
              <td className="px-3 py-2">
                <PassMark pass={result.pass} />
              </td>
              <td className="px-3 py-2">
                <ul className="flex flex-wrap gap-1">
                  {result.scores.map((score) => (
                    <li key={JSON.stringify(score)}>
                      <ScoreChip score={score} />
                      {!score.pass && (
                        <p className="mt-1 max-w-xs text-xs text-danger">{score.reason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{money(result.costUsd)}</td>
              <td className="px-3 py-2 text-right text-muted tabular-nums">
                {durationLabel(result.latencyMs)}
              </td>
              <td className="px-3 py-2 text-right">
                <Link to={`/runs/${result.runId}`} className="text-accent-ink hover:underline">
                  Open run
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
