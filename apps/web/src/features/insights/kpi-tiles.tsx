import type { InsightsOverview } from '@agentforgeloop/shared'
import { Card } from '../../components/ui/card.tsx'
import { cn } from '../../lib/cn.ts'
import { compactNumber, money } from '../../lib/format.ts'
import { percentText, successRate, type Tone, type Trend, trendOf } from './insight-format.ts'
import { Sparkline } from './sparkline.tsx'

const TONE: Record<Tone, string> = {
  good: 'text-active',
  bad: 'text-danger',
  neutral: 'text-muted',
}

type TileProps = {
  label: string
  value: string
  note: string
  trend: Trend
  spark?: number[]
}

function Tile({ label, value, note, trend, spark }: TileProps) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted">{note}</p>
        </div>
        {spark && <Sparkline values={spark} />}
      </div>
      <p className={cn('text-xs', TONE[trend.tone])}>{trend.text}</p>
    </Card>
  )
}

/** A prior-window figure to compare with, or null when the prior window had none. */
const prior = (value: number): number | null => (value > 0 ? value : null)

/** The five headline tiles, each with its change against the prior window of the same length. */
export function KpiTiles({ overview }: { overview: InsightsOverview }) {
  const { totals, previous, series, days } = overview
  const rate = successRate(totals)
  const priorRate = previous.runs > 0 ? successRate(previous) : null
  const share = (count: number) => (totals.runs === 0 ? '—' : percentText(count / totals.runs))

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Tile
        label="Runs"
        value={compactNumber(totals.runs)}
        note={`${totals.succeeded} succeeded`}
        trend={trendOf({
          current: totals.runs,
          previous: prior(previous.runs),
          priorDays: days,
          unit: 'percent',
          upIsGood: null,
        })}
        spark={series.map((point) => point.runs)}
      />
      <Tile
        label="Success rate"
        value={totals.runs === 0 ? '—' : percentText(rate)}
        note={`${totals.succeeded} of ${totals.runs} runs`}
        trend={trendOf({
          current: rate,
          previous: priorRate,
          priorDays: days,
          unit: 'points',
          upIsGood: true,
        })}
      />
      <Tile
        label="Handed to a person"
        value={compactNumber(totals.handedToPerson)}
        note={`${share(totals.handedToPerson)} of runs`}
        trend={trendOf({
          current: totals.handedToPerson,
          previous: prior(previous.handedToPerson),
          priorDays: days,
          unit: 'percent',
          upIsGood: false,
        })}
      />
      <Tile
        label="Runs with errors"
        value={compactNumber(totals.failed)}
        note={`${share(totals.failed)} of runs failed`}
        trend={trendOf({
          current: totals.failed,
          previous: prior(previous.failed),
          priorDays: days,
          unit: 'percent',
          upIsGood: false,
        })}
        spark={series.map((point) => point.failed)}
      />
      <Tile
        label="Spend"
        value={money(totals.spendUsd)}
        note={`${money(totals.meanCostUsd)} per run`}
        trend={trendOf({
          current: totals.spendUsd,
          previous: prior(previous.spendUsd),
          priorDays: days,
          unit: 'percent',
          upIsGood: null,
        })}
        spark={series.map((point) => point.spendUsd)}
      />
    </div>
  )
}
