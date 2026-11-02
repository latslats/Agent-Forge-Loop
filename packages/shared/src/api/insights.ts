import { z } from 'zod'
import { Id, IsoDate } from '../schema/common.ts'

/**
 * Query string of GET /api/insights. `days` is the window length, ending now. `timezone` is the
 * IANA zone whose calendar days bound the window and the series (default UTC).
 */
export const InsightsQuery = z.object({
  agentId: Id.optional(),
  days: z.coerce
    .number()
    .int()
    .pipe(z.literal([7, 14, 30]))
    .default(30),
  timezone: z.string().min(1).default('UTC'),
})
export type InsightsQuery = z.infer<typeof InsightsQuery>
export type InsightsQueryInput = z.input<typeof InsightsQuery>

const Percent = z.number().min(0).max(100)
const Rate = z.number().min(0).max(1)

/** Each score is 0 to 100 over the last 7 days of finished runs. Null when there were none. */
export const HealthScores = z.object({
  adherence: Percent,
  autonomy: Percent,
  efficiency: Percent,
  overall: Percent,
  sampleSize: z.number().int(),
  computedAt: IsoDate,
})
export type HealthScores = z.infer<typeof HealthScores>

export const InsightsTotals = z.object({
  runs: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
  waitingApproval: z.number().int(),
  handedToPerson: z.number().int(),
  errorRate: Rate,
  spendUsd: z.number(),
  meanCostUsd: z.number(),
  p50DurationMs: z.number(),
})
export type InsightsTotals = z.infer<typeof InsightsTotals>

export const InsightsSeriesPoint = z.object({
  /** Calendar day as YYYY-MM-DD in the query's time zone. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runs: z.number().int(),
  failed: z.number().int(),
  spendUsd: z.number(),
})
export type InsightsSeriesPoint = z.infer<typeof InsightsSeriesPoint>

export const InsightsAgentRow = z.object({
  agentId: Id,
  agentName: z.string(),
  runs: z.number().int(),
  successRate: Rate,
  failed: z.number().int(),
  /** Runs in the window with an approval request. */
  handedToPerson: z.number().int(),
  spendUsd: z.number(),
  health: HealthScores.nullable(),
})
export type InsightsAgentRow = z.infer<typeof InsightsAgentRow>

export const InsightsModelRow = z.object({
  model: z.string(),
  calls: z.number().int(),
  spendUsd: z.number(),
})
export type InsightsModelRow = z.infer<typeof InsightsModelRow>

export const InsightsOverview = z.object({
  days: z.number().int(),
  from: IsoDate,
  to: IsoDate,
  totals: InsightsTotals,
  /** The same totals for the window of `days` days before `from`. */
  previous: InsightsTotals,
  series: z.array(InsightsSeriesPoint),
  /** One point per day of the previous window, in the same order as `series`. */
  previousSeries: z.array(InsightsSeriesPoint),
  byAgent: z.array(InsightsAgentRow),
  byModel: z.array(InsightsModelRow),
})
export type InsightsOverview = z.infer<typeof InsightsOverview>

export const insightsRoutes = {
  /** GET with InsightsQuery as the query string: 200 InsightsOverview. */
  overview: '/api/insights',
  /** GET: 200 HealthScores, or JSON null when the agent has no finished runs in 7 days. */
  agentHealth: (agentId: string) => `/api/agents/${agentId}/health`,
} as const
