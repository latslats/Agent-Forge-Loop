import type { InsightsOverview } from '@agentforgeloop/shared'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '../../components/ui/card.tsx'
import { money } from '../../lib/format.ts'
import { longDay, shortDay } from './insight-format.ts'

// Four decimals at most, so two ticks below one cent never print the same label.
const axisUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
})

const tooltipStyle = {
  backgroundColor: 'var(--color-panel)',
  border: '1px solid var(--color-line)',
  borderRadius: 8,
  color: 'var(--color-ink)',
  fontSize: 12,
}

/**
 * Spend per day as bars in the accent colour, with the previous window as a dashed line over the
 * same positions. The colours come from the theme through the wrapper classes, so light and dark
 * mode both follow the tokens. The table below is the current window's data.
 */
export function SpendChart({ overview }: { overview: InsightsOverview }) {
  const { series, previousSeries, totals, days } = overview
  const data = series.map((point, index) => ({
    ...point,
    previousSpendUsd: previousSeries[index]?.spendUsd ?? 0,
  }))
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Spend by day</h2>
        <p className="text-xs text-muted">
          {money(totals.spendUsd)} over {days} days
        </p>
      </div>
      <div
        role="img"
        aria-label={`Bar chart of spend per day for the last ${days} days, with the previous ${days} days as a dashed line`}
        className="text-accent [&_.recharts-bar-rectangle_path]:fill-accent [&_.recharts-cartesian-axis-tick-value]:fill-muted [&_.recharts-cartesian-grid_line]:stroke-line [&_.recharts-tooltip-cursor]:fill-accent"
      >
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => shortDay(day)}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(value: number) => axisUsd.format(value)}
              width={64}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fillOpacity: 0.08 }}
              contentStyle={tooltipStyle}
              itemStyle={{ color: 'var(--color-ink)' }}
              labelFormatter={(label) => longDay(String(label))}
              formatter={(value) => money(Number(value))}
            />
            <Bar
              dataKey="spendUsd"
              name="Spend"
              fill="currentColor"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            <Line
              type="monotone"
              dataKey="previousSpendUsd"
              name={`Previous ${days} days`}
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">
          Show as table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Runs</th>
                <th className="py-1 text-right font-medium">Failed</th>
                <th className="py-1 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {series.map((point) => (
                <tr key={point.day} className="border-t border-line">
                  <td className="py-1">{longDay(point.day)}</td>
                  <td className="py-1 text-right">{point.runs}</td>
                  <td className="py-1 text-right">{point.failed}</td>
                  <td className="py-1 text-right">{money(point.spendUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  )
}
