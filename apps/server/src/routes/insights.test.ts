import { HealthScores, InsightsOverview, insightsRoutes } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { seedRun } from '../db/run-fixtures.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import {
  defaultAgentDefinition,
  fakeLlm,
  publishAgent,
  testEngine,
  textMessage,
} from '../engine/testing.ts'

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  const app = createApp(
    db,
    testEngine(
      db,
      fakeLlm(async () => textMessage('{}')),
    ),
  )
  const agentId = publishAgent(db, defaultAgentDefinition('Insights agent'))
  return { db, app, agentId }
}

/** A run that was created and finished just now, so it falls inside every window. */
const seedFinishedNow = (db: Db, agentId: string, costUsd: number) => {
  const now = new Date().toISOString()
  seedRun(db, {
    agentId,
    status: 'succeeded',
    costUsd,
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    events: [{ kind: 'model_call', payload: { model: 'claude-haiku-5-5', costUsd } }],
  })
}

describe('insights routes', () => {
  it('GET /api/insights answers the overview for the requested window', async () => {
    const { db, app, agentId } = setup()
    seedFinishedNow(db, agentId, 0.25)

    const res = await app.request(`${insightsRoutes.overview}?days=7`)

    expect(res.status).toBe(200)
    const overview = InsightsOverview.parse(await res.json())
    expect(overview.days).toBe(7)
    expect(overview.totals).toMatchObject({ runs: 1, succeeded: 1, errorRate: 0 })
    expect(overview.series).toHaveLength(7)
    expect(overview.series.at(-1)?.runs).toBe(1)
    expect(overview.byModel).toEqual([{ model: 'claude-haiku-5-5', calls: 1, spendUsd: 0.25 }])
  })

  it('answers 400 for an unknown time zone', async () => {
    const { app } = setup()
    const res = await app.request(`${insightsRoutes.overview}?days=7&timezone=Mars/Olympus`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid timezone' })
  })

  it('defaults to a 30-day window and filters by agentId', async () => {
    const { db, app, agentId } = setup()
    seedFinishedNow(db, agentId, 1)
    const other = publishAgent(db, defaultAgentDefinition('Other'))
    seedFinishedNow(db, other, 2)

    const overview = InsightsOverview.parse(await (await app.request('/api/insights')).json())
    expect(overview.days).toBe(30)
    expect(overview.series).toHaveLength(30)
    expect(overview.totals.runs).toBe(2)

    const filtered = InsightsOverview.parse(
      await (await app.request(`/api/insights?agentId=${agentId}`)).json(),
    )
    expect(filtered.totals.runs).toBe(1)
    expect(filtered.byAgent.map((row) => row.agentId)).toEqual([agentId])
  })

  it('rejects a window other than 7, 14 or 30 days', async () => {
    const { app } = setup()

    const res = await app.request('/api/insights?days=5')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'validation' })
  })

  it('GET /api/agents/:id/health is null with no finished runs, then the scores', async () => {
    const { db, app, agentId } = setup()

    const empty = await app.request(insightsRoutes.agentHealth(agentId))
    expect(empty.status).toBe(200)
    expect(await empty.json()).toBeNull()

    seedFinishedNow(db, agentId, 0.25)
    const scored = await app.request(insightsRoutes.agentHealth(agentId))
    expect(scored.status).toBe(200)
    expect(HealthScores.parse(await scored.json())).toMatchObject({
      adherence: 100,
      autonomy: 100,
      efficiency: 100,
      overall: 100,
      sampleSize: 1,
    })
  })

  it('answers 404 for the health of an unknown agent', async () => {
    const { app } = setup()
    expect((await app.request(insightsRoutes.agentHealth('nope'))).status).toBe(404)
  })
})
