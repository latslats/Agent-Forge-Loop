import { useState } from 'react'
import { useInsights, type WindowDays } from '../api/insights.ts'
import { PageHeader } from '../components/layout/page-header.tsx'
import { AgentTable } from '../features/insights/agent-table.tsx'
import { AttentionList } from '../features/insights/attention-list.tsx'
import { KpiTiles } from '../features/insights/kpi-tiles.tsx'
import { ModelTable } from '../features/insights/model-table.tsx'
import { SpendChart } from '../features/insights/spend-chart.tsx'
import { WhenLoaded } from '../features/insights/when-loaded.tsx'
import { WindowSelect } from '../features/insights/window-select.tsx'

export function InsightsPage() {
  const [days, setDays] = useState<WindowDays>(30)
  const insights = useInsights({ days })

  return (
    <>
      <PageHeader
        title="Insights"
        description="Runs, success and spend across all agents."
        actions={<WindowSelect value={days} onChange={setDays} />}
      />
      <div className="space-y-6 p-6">
        <WhenLoaded query={insights} days={days}>
          {(overview) => (
            <>
              <KpiTiles overview={overview} />
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="min-w-0 lg:col-span-2">
                  <SpendChart overview={overview} />
                </div>
                <AttentionList rows={overview.byAgent} />
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="min-w-0 lg:col-span-2">
                  <AgentTable rows={overview.byAgent} />
                </div>
                <ModelTable rows={overview.byModel} />
              </div>
            </>
          )}
        </WhenLoaded>
      </div>
    </>
  )
}
