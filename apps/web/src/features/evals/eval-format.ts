import type { EvalRunStatus } from '@agentforgeloop/shared'

export const EVAL_STATUS_LABELS: Record<EvalRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
}

/** "67%" for 0.666…; the table and tiles show whole percentages. */
export const percent = (rate: number): string => `${Math.round(rate * 100)}%`

/** "+33 pts", "−8 pts", "0 pts" for a change in pass rate (0 to 1). */
export const signedPoints = (delta: number): string => {
  const points = Math.round(delta * 100)
  return points === 0 ? '0 pts' : `${points > 0 ? '+' : '−'}${Math.abs(points)} pts`
}

/** A signed dollar change, e.g. "+$0.0012" or "−$0.0004". */
export const signedUsd = (delta: number): string => {
  const sign = delta < 0 ? '−' : '+'
  return `${sign}$${Math.abs(delta).toFixed(4)}`
}

/** A signed millisecond change, e.g. "+120 ms" or "−45 ms". */
export const signedMs = (delta: number): string => {
  const sign = delta < 0 ? '−' : '+'
  return `${sign}${Math.round(Math.abs(delta))} ms`
}
