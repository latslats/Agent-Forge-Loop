import type {
  InsightsAgentRow,
  InsightsModelRow,
  InsightsOverview,
  InsightsQuery,
  InsightsSeriesPoint,
  InsightsTotals,
} from '@agentforgeloop/shared'
import { computeHealth, FINISHED_SQL, HANDED_SQL, median, NON_EVAL_SQL } from '../engine/health.ts'
import { ValidationError } from '../errors.ts'
import { all, type Db, get } from './sqlite.ts'

const DAY_MS = 86_400_000

/** Runs created from `from` on, or before `until` when given. Runs are scoped by created_at. */
type Scope = { agentId?: string; from: string; until?: string }

const wallFormats = new Map<string, Intl.DateTimeFormat>()

const wallFormat = (timezone: string): Intl.DateTimeFormat => {
  let format = wallFormats.get(timezone)
  if (!format) {
    try {
      format = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      throw new ValidationError('invalid timezone')
    }
    wallFormats.set(timezone, format)
  }
  return format
}

/** The wall clock of `instant` in `timezone`, as the ISO string YYYY-MM-DDTHH:MM:SS. */
const wallClock = (instant: Date, timezone: string): string => {
  const part = new Map(
    wallFormat(timezone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  const date = `${part.get('year')}-${part.get('month')}-${part.get('day')}`
  return `${date}T${part.get('hour')}:${part.get('minute')}:${part.get('second')}`
}

/** The YYYY-MM-DD calendar day of an instant in `timezone`. Throws ValidationError for a bad zone. */
const dayOf = (instant: Date, timezone: string): string => wallClock(instant, timezone).slice(0, 10)

/** The calendar day `offset` days after `day` (plain date arithmetic, no zone involved). */
const shiftDay = (day: string, offset: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10)

/**
 * The instant at which `day` starts in `timezone`: the UTC midnight of that date, moved by the
 * zone's offset. A second pass settles a guess that landed across a transition.
 */
const startOfDay = (day: string, timezone: string): Date => {
  const target = Date.parse(`${day}T00:00:00Z`)
  let instant = target
  for (let pass = 0; pass < 2; pass += 1) {
    instant -= Date.parse(`${wallClock(new Date(instant), timezone)}Z`) - target
  }
  return new Date(instant)
}

const scopeSql = (scope: Scope): { sql: string; params: string[] } => {
  const clauses = ['r.created_at >= ?', NON_EVAL_SQL]
  const params = [scope.from]
  if (scope.until !== undefined) {
    clauses.push('r.created_at < ?')
    params.push(scope.until)
  }
  if (scope.agentId !== undefined) {
    clauses.push('r.agent_id = ?')
    params.push(scope.agentId)
  }
  return { sql: clauses.join(' AND '), params }
}

const totalsFor = (db: Db, scope: Scope): InsightsTotals => {
  const { sql, params } = scopeSql(scope)
  const row = get<{
    runs: number
    succeeded: number
    failed: number
    waiting: number
    handed: number
    spend: number
  }>(
    db,
    `SELECT COUNT(*) AS runs,
            COALESCE(SUM(r.status = 'succeeded'), 0) AS succeeded,
            COALESCE(SUM(r.status = 'failed'), 0) AS failed,
            COALESCE(SUM(r.status = 'waiting_approval'), 0) AS waiting,
            COALESCE(SUM(${HANDED_SQL}), 0) AS handed,
            COALESCE(SUM(r.cost_usd), 0) AS spend
       FROM runs r WHERE ${sql}`,
    params,
  )
  const durations = all<{ started_at: string; finished_at: string }>(
    db,
    `SELECT r.started_at, r.finished_at FROM runs r
      WHERE ${sql} AND ${FINISHED_SQL} AND r.started_at IS NOT NULL AND r.finished_at IS NOT NULL`,
    params,
  ).map((run) => Date.parse(run.finished_at) - Date.parse(run.started_at))

  const runs = row?.runs ?? 0
  const spend = row?.spend ?? 0
  return {
    runs,
    succeeded: row?.succeeded ?? 0,
    failed: row?.failed ?? 0,
    waitingApproval: row?.waiting ?? 0,
    handedToPerson: row?.handed ?? 0,
    errorRate: runs === 0 ? 0 : (row?.failed ?? 0) / runs,
    spendUsd: spend,
    meanCostUsd: runs === 0 ? 0 : spend / runs,
    p50DurationMs: median(durations),
  }
}

/**
 * One point per calendar day of `timezone` from `firstDay` on, with zeros for days without runs.
 * Days are bucketed here, not in SQL, because SQLite cannot convert zones.
 */
const seriesFor = (
  db: Db,
  scope: Scope,
  firstDay: string,
  days: number,
  timezone: string,
): InsightsSeriesPoint[] => {
  const { sql, params } = scopeSql(scope)
  const byDay = new Map<string, InsightsSeriesPoint>()
  const point = (day: string): InsightsSeriesPoint => {
    const existing = byDay.get(day)
    if (existing) return existing
    const created = { day, runs: 0, failed: 0, spendUsd: 0 }
    byDay.set(day, created)
    return created
  }
  for (let index = 0; index < days; index += 1) point(shiftDay(firstDay, index))
  const rows = all<{ created_at: string; status: string; cost_usd: number }>(
    db,
    `SELECT r.created_at, r.status, r.cost_usd FROM runs r WHERE ${sql}`,
    params,
  )
  for (const row of rows) {
    const entry = point(dayOf(new Date(row.created_at), timezone))
    entry.runs += 1
    if (row.status === 'failed') entry.failed += 1
    entry.spendUsd += row.cost_usd
  }
  return Array.from({ length: days }, (_, index) => point(shiftDay(firstDay, index)))
}

const byAgentFor = (db: Db, scope: Scope, now: Date): InsightsAgentRow[] => {
  const { sql, params } = scopeSql(scope)
  return all<{
    agent_id: string
    agent_name: string
    runs: number
    succeeded: number
    failed: number
    handed: number
    spend: number
  }>(
    db,
    `SELECT r.agent_id, a.name AS agent_name, COUNT(*) AS runs,
            COALESCE(SUM(r.status = 'succeeded'), 0) AS succeeded,
            COALESCE(SUM(r.status = 'failed'), 0) AS failed,
            COALESCE(SUM(${HANDED_SQL}), 0) AS handed,
            COALESCE(SUM(r.cost_usd), 0) AS spend
       FROM runs r JOIN agents a ON a.id = r.agent_id
      WHERE ${sql}
      GROUP BY r.agent_id, a.name
      ORDER BY spend DESC, a.name`,
    params,
  ).map((row) => ({
    agentId: row.agent_id,
    agentName: row.agent_name,
    runs: row.runs,
    successRate: row.succeeded / row.runs,
    failed: row.failed,
    handedToPerson: row.handed,
    spendUsd: row.spend,
    health: computeHealth(db, row.agent_id, now),
  }))
}

/** Calls and spend per model, read from the model_call events of runs in the window. */
const byModelFor = (db: Db, scope: Scope): InsightsModelRow[] => {
  const { sql, params } = scopeSql(scope)
  return all<{ model: string | null; calls: number; spend: number }>(
    db,
    `SELECT json_extract(e.payload_json, '$.model') AS model,
            COUNT(*) AS calls,
            COALESCE(SUM(json_extract(e.payload_json, '$.costUsd')), 0) AS spend
       FROM run_events e JOIN runs r ON r.id = e.run_id
      WHERE e.kind = 'model_call' AND ${sql}
      GROUP BY model
      ORDER BY spend DESC`,
    params,
  ).map((row) => ({ model: row.model ?? 'unknown', calls: row.calls, spendUsd: row.spend }))
}

/**
 * The Insights page data. The window is the last `days` calendar days of `query.timezone` ending
 * today; `previous` is the same number of days before it. An agentId narrows every part.
 */
export const overview = (
  db: Db,
  query: InsightsQuery,
  now: Date = new Date(),
): InsightsOverview => {
  const { days, timezone, agentId } = query
  const firstDay = shiftDay(dayOf(now, timezone), -(days - 1))
  const previousFirstDay = shiftDay(firstDay, -days)
  const start = startOfDay(firstDay, timezone).toISOString()
  const previousStart = startOfDay(previousFirstDay, timezone).toISOString()
  const scope: Scope = { agentId, from: start }
  const previousScope: Scope = { agentId, from: previousStart, until: start }
  return {
    days,
    from: start,
    to: now.toISOString(),
    totals: totalsFor(db, scope),
    previous: totalsFor(db, previousScope),
    series: seriesFor(db, scope, firstDay, days, timezone),
    previousSeries: seriesFor(db, previousScope, previousFirstDay, days, timezone),
    byAgent: byAgentFor(db, scope, now),
    byModel: byModelFor(db, scope),
  }
}
