import type { HealthScores } from '@agentforgeloop/shared'
import type { UseQueryResult } from '@tanstack/react-query'
import { errorMessage } from '../../api/client.ts'
import { Card } from '../../components/ui/card.tsx'
import { healthBand } from './insight-format.ts'

const SCORES = [
  {
    key: 'adherence',
    label: 'Adherence',
    detail: 'Share of runs with no tool error and no failed check.',
  },
  {
    key: 'autonomy',
    label: 'Autonomy',
    detail: 'Share of runs that finished without asking a person to decide.',
  },
  {
    key: 'efficiency',
    label: 'Efficiency',
    detail:
      '100 while the 7-day median cost per run is at most the 30-day median. Lower in proportion when it rises.',
  },
] as const

/** The three health scores of one agent, with what each one measures. */
export function HealthPanel({ query }: { query: UseQueryResult<HealthScores | null> }) {
  const scores = query.data
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Health</h2>
      <p className="mt-0.5 text-xs text-muted">
        {scores ? `From ${scores.sampleSize} finished runs in the last 7 days` : 'Last 7 days'}
      </p>
      {query.isPending && <p className="mt-4 text-sm text-muted">Loading health…</p>}
      {query.isError && <p className="mt-4 text-sm text-danger">{errorMessage(query.error)}</p>}
      {!query.isPending && !query.isError && scores === null && (
        <p className="mt-4 text-sm text-muted">
          No finished runs in the last 7 days. Run the agent to see its health.
        </p>
      )}
      {scores && (
        <div className="mt-4 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Overall</p>
            <p className={`text-lg font-semibold ${healthBand(scores.overall).text}`}>
              {scores.overall}
              <span className="ml-1.5 text-xs font-medium">{healthBand(scores.overall).label}</span>
            </p>
          </div>
          {SCORES.map(({ key, label, detail }) => {
            const value = scores[key]
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
