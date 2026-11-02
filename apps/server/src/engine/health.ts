import type { HealthScores } from '@agentforgeloop/shared'
import { all, type Db } from '../db/sqlite.ts'

const DAY_MS = 86_400_000

/** Only finished runs are scored. Queued, running and waiting runs are not yet known. */
export const FINISHED_SQL = "r.status IN ('succeeded', 'failed', 'cancelled')"

/** SQL condition on runs r: production runs. Eval cases are runs too, but they are not traffic. */
export const NON_EVAL_SQL = "r.trigger_kind <> 'eval'"

/** SQL condition on runs r: the run had a tool error or a failed check. */
export const HAS_PROBLEM_SQL = `EXISTS (
  SELECT 1 FROM run_events e WHERE e.run_id = r.id AND (
    (e.kind = 'tool_result' AND json_extract(e.payload_json, '$.isError') = 1) OR
    (e.kind = 'check_result' AND json_extract(e.payload_json, '$.pass') = 0)))`

/** SQL condition on runs r: the run asked a person to decide (an approval was requested). */
export const HANDED_SQL = `EXISTS (
  SELECT 1 FROM run_events e WHERE e.run_id = r.id AND e.kind = 'approval_requested')`

export const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const upper = sorted[mid] ?? 0
  const lower = sorted[mid - 1] ?? upper
  return sorted.length % 2 === 1 ? upper : (lower + upper) / 2
}

const daysBefore = (now: Date, days: number): string =>
  new Date(now.getTime() - days * DAY_MS).toISOString()

/**
 * Health of one agent over the last 7 days of finished runs. Null when there were none.
 * Adherence: runs with no tool error and no failed check. Autonomy: runs no person had to decide.
 * Efficiency: 100 while the 7-day median cost is at most the 30-day median, else the ratio.
 */
export const computeHealth = (db: Db, agentId: string, now: Date): HealthScores | null => {
  const recent = all<{ cost_usd: number; handed: number; problem: number }>(
    db,
    `SELECT r.cost_usd, ${HANDED_SQL} AS handed, ${HAS_PROBLEM_SQL} AS problem
       FROM runs r WHERE r.agent_id = ? AND ${FINISHED_SQL} AND ${NON_EVAL_SQL} AND r.finished_at >= ?`,
    [agentId, daysBefore(now, 7)],
  )
  if (recent.length === 0) return null

  const monthly = all<{ cost_usd: number }>(
    db,
    `SELECT r.cost_usd FROM runs r
      WHERE r.agent_id = ? AND ${FINISHED_SQL} AND ${NON_EVAL_SQL} AND r.finished_at >= ?`,
    [agentId, daysBefore(now, 30)],
  )

  const percent = (count: number) => Math.round((100 * count) / recent.length)
  const adherence = percent(recent.filter((row) => row.problem === 0).length)
  const autonomy = percent(recent.filter((row) => row.handed === 0).length)
  const weekCost = median(recent.map((row) => row.cost_usd))
  const monthCost = median(monthly.map((row) => row.cost_usd))
  const efficiency =
    weekCost <= monthCost ? 100 : Math.max(0, Math.round((100 * monthCost) / weekCost))

  return {
    adherence,
    autonomy,
    efficiency,
    overall: Math.round((adherence + autonomy + efficiency) / 3),
    sampleSize: recent.length,
    computedAt: now.toISOString(),
  }
}
