import type { InsightsAgentRow } from '@agentforgeloop/shared'
import { CircleAlert, CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Card } from '../../components/ui/card.tsx'
import { percentText } from './insight-format.ts'

type Flag = { agent: InsightsAgentRow; reason: string }

/**
 * Simple rules over the agents of the window. Below 80% success needs attention, and so does an
 * agent handed to a person in more than half of its runs. Going well: five or more runs and none
 * failed.
 */
export function attentionRules(rows: InsightsAgentRow[]): { attention: Flag[]; good: Flag[] } {
  const attention: Flag[] = []
  const good: Flag[] = []
  for (const row of rows) {
    const handedRate = row.handedToPerson / row.runs
    if (row.successRate < 0.8) {
      attention.push({
        agent: row,
        reason: `Success rate ${percentText(row.successRate)} over ${row.runs} runs`,
      })
    } else if (handedRate > 0.5) {
      attention.push({
        agent: row,
        reason: `Handed to a person in ${percentText(handedRate)} of ${row.runs} runs`,
      })
    } else if (row.failed === 0 && row.runs >= 5) {
      good.push({ agent: row, reason: `No failures in ${row.runs} runs` })
    }
  }
  return { attention, good }
}

function FlagGroup({
  title,
  flags,
  icon,
  empty,
}: {
  title: string
  flags: Flag[]
  icon: ReactNode
  empty: string
}) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {title}
      </h3>
      {flags.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {flags.map(({ agent, reason }) => (
            <li key={agent.agentId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={agent.agentName}>
                  {agent.agentName}
                </p>
                <p className="text-xs text-muted">{reason}</p>
              </div>
              <Link
                to={`/agents/${agent.agentId}`}
                className="shrink-0 rounded-control text-xs font-medium text-accent-ink hover:underline"
              >
                Open agent
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AttentionList({ rows }: { rows: InsightsAgentRow[] }) {
  const { attention, good } = attentionRules(rows)
  return (
    <Card className="flex flex-col gap-5 p-4">
      <h2 className="text-sm font-semibold">Needs attention and going well</h2>
      <FlagGroup
        title="Needs attention"
        flags={attention}
        icon={<CircleAlert className="size-3.5 text-paused" aria-hidden="true" />}
        empty="No agent is below 80% success or handed to a person in most runs."
      />
      <FlagGroup
        title="Going well"
        flags={good}
        icon={<CircleCheck className="size-3.5 text-active" aria-hidden="true" />}
        empty="No agent has five or more runs without a failure yet."
      />
    </Card>
  )
}
