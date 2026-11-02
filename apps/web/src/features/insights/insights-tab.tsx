import type { AgentWithVersions } from '@agentforgeloop/shared'
import { useState } from 'react'
import { useAgentHealth, useInsights, type WindowDays } from '../../api/insights.ts'
import { HealthPanel } from './health-scores.tsx'
import { KpiTiles } from './kpi-tiles.tsx'
import { SpendChart } from './spend-chart.tsx'
import { WhenLoaded } from './when-loaded.tsx'
import { WindowSelect } from './window-select.tsx'

/** The agent's own runs, spend and health. Same tiles and chart as the Insights page. */
export function InsightsTab({ agent }: { agent: AgentWithVersions }) {
  const [days, setDays] = useState<WindowDays>(30)
  const insights = useInsights({ agentId: agent.id, days })
  const health = useAgentHealth(agent.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">This agent</h2>
          <p className="text-sm text-muted">Runs, success and spend over the last {days} days.</p>
        </div>
        <WindowSelect value={days} onChange={setDays} />
      </div>
      <WhenLoaded query={insights} days={days}>
        {(overview) => (
          <div className="space-y-6">
            <KpiTiles overview={overview} />
            <SpendChart overview={overview} />
          </div>
        )}
      </WhenLoaded>
      <HealthPanel query={health} />
    </div>
  )
}
