import { describe, expect, it } from 'vitest'
import { type SeedRun, seedRun } from '../db/run-fixtures.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import { computeHealth, median } from './health.ts'
import { defaultAgentDefinition, publishAgent } from './testing.ts'

const NOW = new Date('2026-10-13T12:00:00.000Z')
const DAY = 86_400_000

/** A run that finished `daysAgo` days before NOW. */
const finishedRun = (
  agentId: string,
  daysAgo: number,
  status: string,
  costUsd: number,
  events: SeedRun['events'] = [],
): SeedRun => {
  const finished = new Date(NOW.getTime() - daysAgo * DAY).toISOString()
  return {
    agentId,
    status,
    costUsd,
    createdAt: finished,
    startedAt: finished,
    finishedAt: finished,
    events,
  }
}

const setup = (): { db: Db; agentId: string } => {
  const db = openDb(':memory:')
  migrate(db)
  return { db, agentId: publishAgent(db, defaultAgentDefinition('Health agent')) }
}

const toolResult = (isError: boolean) => ({
  kind: 'tool_result',
  payload: { tool: 'lookup', output: null, isError, durationMs: 1 },
})
const checkResult = (pass: boolean) => ({
  kind: 'check_result',
  payload: { kind: 'regex', pass, reason: '' },
})
const approval = { kind: 'approval_requested', payload: { approvalId: 'a1', message: 'ok?' } }

describe('computeHealth', () => {
  it('is null when the agent has no finished runs in the last 7 days', () => {
    const { db, agentId } = setup()
    expect(computeHealth(db, agentId, NOW)).toBeNull()

    seedRun(db, finishedRun(agentId, 8, 'succeeded', 1))
    seedRun(db, { agentId, status: 'running', createdAt: NOW.toISOString() })
    seedRun(db, { agentId, status: 'waiting_approval', createdAt: NOW.toISOString() })
    expect(computeHealth(db, agentId, NOW)).toBeNull()
  })

  it('scores adherence, autonomy and efficiency over the 7-day runs', () => {
    const { db, agentId } = setup()
    seedRun(db, finishedRun(agentId, 1, 'succeeded', 1, [toolResult(false), checkResult(true)]))
    seedRun(db, finishedRun(agentId, 2, 'succeeded', 1, [toolResult(true)]))
    seedRun(db, finishedRun(agentId, 3, 'failed', 1, [checkResult(false)]))
    seedRun(db, finishedRun(agentId, 4, 'cancelled', 1, [approval]))

    expect(computeHealth(db, agentId, NOW)).toEqual({
      adherence: 50,
      autonomy: 75,
      efficiency: 100,
      overall: 75,
      sampleSize: 4,
      computedAt: NOW.toISOString(),
    })
  })

  it('lowers efficiency by the ratio of the 30-day median to the 7-day median', () => {
    const { db, agentId } = setup()
    seedRun(db, finishedRun(agentId, 2, 'succeeded', 4))
    seedRun(db, finishedRun(agentId, 20, 'succeeded', 2))
    seedRun(db, finishedRun(agentId, 21, 'succeeded', 2))

    // 7-day median 4, 30-day median 2: efficiency 50. The 20-day runs are outside 7 days.
    const health = computeHealth(db, agentId, NOW)
    expect(health).toMatchObject({ adherence: 100, autonomy: 100, efficiency: 50, sampleSize: 1 })
    expect(health?.overall).toBe(83)
  })

  it('keeps efficiency at 100 when recent runs cost no more than the 30-day median', () => {
    const { db, agentId } = setup()
    seedRun(db, finishedRun(agentId, 1, 'succeeded', 1))
    seedRun(db, finishedRun(agentId, 15, 'succeeded', 5))
    seedRun(db, finishedRun(agentId, 16, 'succeeded', 5))

    expect(computeHealth(db, agentId, NOW)).toMatchObject({ efficiency: 100, overall: 100 })
  })

  it('computes the median of an even and an odd count', () => {
    expect(median([])).toBe(0)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('does not depend on agents other than the one asked for', () => {
    const { db, agentId } = setup()
    const other = publishAgent(db, defaultAgentDefinition('Other'))
    seedRun(db, finishedRun(other, 1, 'failed', 1, [toolResult(true)]))
    seedRun(db, finishedRun(agentId, 1, 'succeeded', 1))

    expect(computeHealth(db, agentId, NOW)).toMatchObject({ adherence: 100, sampleSize: 1 })
  })
})
