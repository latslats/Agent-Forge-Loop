import type { InsightsTotals } from '@agentforgeloop/shared'

export type Tone = 'good' | 'bad' | 'neutral'
export type Trend = { text: string; tone: Tone }

const percentFormat = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 })
// Days are calendar dates (YYYY-MM-DD) in the viewer's zone, so they are read and printed as
// plain dates, with no zone shift.
const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const longDayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export const percentText = (rate: number): string => percentFormat.format(rate)

export const successRate = (totals: InsightsTotals): number =>
  totals.runs === 0 ? 0 : totals.succeeded / totals.runs

export const shortDay = (day: string): string => dayFormat.format(new Date(`${day}T00:00:00Z`))
export const longDay = (day: string): string => longDayFormat.format(new Date(`${day}T00:00:00Z`))

/**
 * The change against the prior window. `previous` is null when the prior window had nothing to
 * compare with. `upIsGood` sets the tone of a rise: true for success, false for errors, null for
 * neutral figures such as run counts. The sign in the text carries the direction, not the colour.
 */
export function trendOf({
  current,
  previous,
  priorDays,
  unit,
  upIsGood,
}: {
  current: number
  previous: number | null
  priorDays: number
  unit: 'percent' | 'points'
  upIsGood: boolean | null
}): Trend {
  const prior = `prior ${priorDays} days`
  if (previous === null || (unit === 'percent' && previous === 0)) {
    return { text: `Nothing in ${prior}`, tone: 'neutral' }
  }
  const change =
    unit === 'points'
      ? Math.round((current - previous) * 100)
      : Math.round(((current - previous) / previous) * 100)
  if (change === 0) return { text: `No change vs ${prior}`, tone: 'neutral' }
  const sign = change > 0 ? '+' : '−'
  const amount = unit === 'points' ? `${Math.abs(change)} pts` : `${Math.abs(change)}%`
  const tone: Tone = upIsGood === null ? 'neutral' : change > 0 === upIsGood ? 'good' : 'bad'
  return { text: `${sign}${amount} vs ${prior}`, tone }
}

export type HealthBand = { label: string; text: string; stroke: string }

/** Good from 80, warning from 60, critical below. The colour always comes with the label. */
export function healthBand(score: number): HealthBand {
  if (score >= 80) return { label: 'Good', text: 'text-active', stroke: 'stroke-active' }
  if (score >= 60) return { label: 'Warning', text: 'text-paused', stroke: 'stroke-paused' }
  return { label: 'Critical', text: 'text-danger', stroke: 'stroke-danger' }
}
