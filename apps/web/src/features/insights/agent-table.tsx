import type { InsightsAgentRow } from '@agentforgeloop/shared'
import { Link } from 'react-router'
import { Card } from '../../components/ui/card.tsx'
import { money } from '../../lib/format.ts'
import { healthBand, percentText } from './insight-format.ts'

export function AgentTable({ rows }: { rows: InsightsAgentRow[] }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Agents</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="pb-2 font-medium">
                Agent
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Runs
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Success
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Spend
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Health
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row) => {
              const band = row.health ? healthBand(row.health.overall) : null
              return (
                <tr key={row.agentId} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      to={`/agents/${row.agentId}`}
                      className="rounded-control font-medium text-ink hover:text-accent-ink hover:underline"
                    >
                      {row.agentName}
                    </Link>
                  </td>
                  <td className="py-2 text-right">{row.runs}</td>
                  <td className="py-2 text-right">{percentText(row.successRate)}</td>
                  <td className="py-2 text-right">{money(row.spendUsd)}</td>
                  <td className="py-2 text-right">
                    {row.health && band ? (
                      <span className={band.text}>
                        {row.health.overall}
                        <span className="ml-1.5 text-xs text-muted">{band.label}</span>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
