import type { EvalSummary } from '@agentforgeloop/shared'
import { money } from '../../lib/format.ts'
import { durationLabel } from '../runs/run-format.ts'
import { percent } from './eval-format.ts'
import { Stat } from './stat.tsx'

export function SummaryTiles({ summary }: { summary: EvalSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Passed" value={`${summary.passed} of ${summary.total}`} />
      <Stat label="Pass rate" value={percent(summary.passRate)} />
      <Stat label="Mean cost" value={money(summary.meanCostUsd)} />
      <Stat label="p50 latency" value={durationLabel(summary.p50LatencyMs)} />
    </dl>
  )
}
