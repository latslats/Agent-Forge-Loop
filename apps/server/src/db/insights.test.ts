import { InsightsOverview, InsightsQuery } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { defaultAgentDefinition, publishAgent } from '../engine/testing.ts'
import { overview } from './insights.ts'
import { type SeedRun, seedRun } from './run-fixtures.ts'
import { type Db, migrate, openDb } from './sqlite.ts'

const NOW = new Date('2026-10-13T12:00:00.000Z')

const modelCall = (model: string, costUsd: number) => ({
  kind: 'model_call',
  payload: { model, costUsd },
})

/** Seeds two agents, a current window (7 days) and one run in the previous window. */
const setup = (): { db: Db; alpha: string; beta: string } => {
  const db = openDb(':memory:')
  migrate(db)
  const alpha = publishAgent(db, defaultAgentDefinition('Alpha'))
  const beta = publishAgent(db, defaultAgentDefinition('Beta'))
  const runs: SeedRun[] = [
    {
      agentId: alpha,
      status: 'succeeded',
      costUsd: 0.5,
      createdAt: '2026-10-13T09:00:00.000Z',
      startedAt: '2026-10-13T09:00:00.000Z',
      finishedAt: '2026-10-13T09:00:30.000Z',
      events: [modelCall('claude-haiku-5-5', 0.5)],
    },
    {
      agentId: alpha,
      status: 'failed',
      costUsd: 1.5,
      createdAt: '2026-10-10T10:00:00.000Z',
      startedAt: '2026-10-10T10:00:00.000Z',
      finishedAt: '2026-10-10T10:01:00.000Z',
      events: [
        modelCall('claude-haiku-5-5', 1.5),
        { kind: 'approval_requested', payload: { approvalId: 'a', message: '' } },
      ],
    },
    {
      agentId: beta,
      status: 'succeeded',
      costUsd: 3,
      createdAt: '2026-10-07T00:00:00.000Z',
      startedAt: '2026-10-07T00:00:00.000Z',
      finishedAt: '2026-10-07T00:02:00.000Z',
      events: [modelCall('claude-sonnet-5-5', 3)],
    },
    { agentId: alpha, status: 'waiting_approval', createdAt: '2026-10-08T12:00:00.000Z' },
    {
      agentId: alpha,
      status: 'succeeded',
      costUsd: 1,
      createdAt: '2026-10-01T08:00:00.000Z',
      startedAt: '2026-10-01T08:00:00.000Z',
      finishedAt: '2026-10-01T08:00:30.000Z',
      events: [modelCall('claude-haiku-5-5', 1)],
    },
    // Before the previous window (which starts 2026-09-30 for 7 days): not counted anywhere.
    { agentId: alpha, status: 'succeeded', costUsd: 9, createdAt: '2026-09-29T08:00:00.000Z' },
  ]
  for (const spec of runs) seedRun(db, spec)
  return { db, alpha, beta }
}

const query = (days: 7 | 14 | 30, agentId?: string, timezone?: string) =>
  InsightsQuery.parse({ days, agentId, timezone })

describe('overview', () => {
  it('counts totals for the window and the previous window', () => {
    const { db } = setup()
    const result = overview(db, query(7), NOW)

    expect(result.from).toBe('2026-10-07T00:00:00.000Z')
    expect(result.to).toBe(NOW.toISOString())
    expect(result.totals).toMatchObject({
      runs: 4,
      succeeded: 2,
      failed: 1,
      waitingApproval: 1,
      handedToPerson: 1,
      errorRate: 0.25,
      meanCostUsd: 1.25,
      p50DurationMs: 60_000,
    })
    expect(result.totals.spendUsd).toBeCloseTo(5)
    expect(result.previous).toMatchObject({ runs: 1, succeeded: 1, failed: 0, errorRate: 0 })
    expect(result.previous.spendUsd).toBeCloseTo(1)
    expect(InsightsOverview.parse(result)).toBeDefined()
  })

  it('returns one series point per day, with zeros for empty days', () => {
    const { db } = setup()
    const { series } = overview(db, query(7), NOW)

    expect(series.map((point) => point.day)).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ])
    expect(series[0]).toMatchObject({ runs: 1, failed: 0 })
    expect(series[1]).toMatchObject({ runs: 1, spendUsd: 0 })
    expect(series[2]).toMatchObject({ runs: 0, failed: 0, spendUsd: 0 })
    expect(series[3]).toMatchObject({ runs: 1, failed: 1 })
    expect(series[3]?.spendUsd).toBeCloseTo(1.5)
    expect(series[6]).toMatchObject({ runs: 1, failed: 0 })
  })

  it('returns the previous window as a series of the same length', () => {
    const { db } = setup()
    const { series, previousSeries } = overview(db, query(7), NOW)

    expect(previousSeries).toHaveLength(series.length)
    expect(previousSeries[0]?.day).toBe('2026-09-30')
    expect(previousSeries.at(-1)?.day).toBe('2026-10-06')
    expect(previousSeries[1]).toMatchObject({ day: '2026-10-01', runs: 1, spendUsd: 1 })
    expect(previousSeries.reduce((sum, point) => sum + point.runs, 0)).toBe(1)
  })

  it('bounds the window and buckets days in the requested time zone', () => {
    const { db } = setup()
    // At 12:00Z on 2026-10-13 it is already 2026-10-14 in Auckland (UTC+13 in October).
    const result = overview(db, query(7, undefined, 'Pacific/Auckland'), NOW)

    expect(result.from).toBe('2026-10-07T11:00:00.000Z')
    expect(result.series[0]?.day).toBe('2026-10-08')
    expect(result.series.at(-1)?.day).toBe('2026-10-14')
    // Beta's run at 2026-10-07T00:00Z is 13:00 on the 7th in Auckland: before the window.
    expect(result.totals.runs).toBe(3)
    expect(result.previous.runs).toBe(2)
    // Alpha's run at 2026-10-13T09:00Z is 22:00 on the 13th in Auckland.
    expect(result.series.find((point) => point.day === '2026-10-13')).toMatchObject({ runs: 1 })
    expect(result.series.at(-1)).toMatchObject({ runs: 0 })
  })

  it('rejects an unknown time zone', () => {
    const { db } = setup()
    expect(() => overview(db, query(7, undefined, 'Mars/Olympus'), NOW)).toThrow('invalid timezone')
  })

  it('gives a 30-day window 30 days of series ending today', () => {
    const { db } = setup()
    const { series } = overview(db, query(30), NOW)

    expect(series).toHaveLength(30)
    expect(series[0]?.day).toBe('2026-09-14')
    expect(series.at(-1)?.day).toBe('2026-10-13')
  })

  it('lists agents by spend with health, and models by spend', () => {
    const { db, alpha, beta } = setup()
    const result = overview(db, query(7), NOW)

    expect(result.byAgent.map((row) => row.agentId)).toEqual([beta, alpha])
    expect(result.byAgent[0]).toMatchObject({ agentName: 'Beta', runs: 1, successRate: 1 })
    expect(result.byAgent[1]).toMatchObject({
      agentName: 'Alpha',
      runs: 3,
      failed: 1,
      handedToPerson: 1,
      spendUsd: 2,
    })
    expect(result.byAgent[0]).toMatchObject({ failed: 0, handedToPerson: 0 })
    expect(result.byAgent[1]?.successRate).toBeCloseTo(1 / 3)
    expect(result.byAgent[1]?.health).toEqual({
      adherence: 100,
      autonomy: 50,
      efficiency: 100,
      overall: 83,
      sampleSize: 2,
      computedAt: NOW.toISOString(),
    })
    expect(result.byAgent[0]?.health).toMatchObject({ overall: 100, sampleSize: 1 })

    expect(result.byModel).toEqual([
      { model: 'claude-sonnet-5-5', calls: 1, spendUsd: 3 },
      { model: 'claude-haiku-5-5', calls: 2, spendUsd: 2 },
    ])
  })

  it('narrows every part to one agent when an agentId is given', () => {
    const { db, beta } = setup()
    const result = overview(db, query(7, beta), NOW)

    expect(result.totals).toMatchObject({ runs: 1, succeeded: 1, handedToPerson: 0 })
    expect(result.totals.spendUsd).toBeCloseTo(3)
    expect(result.previous.runs).toBe(0)
    expect(result.byAgent.map((row) => row.agentName)).toEqual(['Beta'])
    expect(result.byModel).toEqual([{ model: 'claude-sonnet-5-5', calls: 1, spendUsd: 3 }])
    expect(result.series.reduce((sum, point) => sum + point.runs, 0)).toBe(1)
  })

  it('returns zeros and empty lists when there are no runs', () => {
    const db = openDb(':memory:')
    migrate(db)
    const result = overview(db, query(14), NOW)

    expect(result.totals).toMatchObject({ runs: 0, errorRate: 0, meanCostUsd: 0, spendUsd: 0 })
    expect(result.series).toHaveLength(14)
    expect(result.byAgent).toEqual([])
    expect(result.byModel).toEqual([])
  })
})
