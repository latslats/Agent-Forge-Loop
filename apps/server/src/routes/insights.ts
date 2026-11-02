import { InsightsQuery } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import { getAgent } from '../db/agents.ts'
import { overview } from '../db/insights.ts'
import type { Db } from '../db/sqlite.ts'
import { computeHealth } from '../engine/health.ts'
import type { EngineDeps } from '../engine/types.ts'

export const insightRoutes = (db: Db, _deps: EngineDeps) => {
  const api = new Hono()

  api.get('/insights', (c) => c.json(overview(db, InsightsQuery.parse(c.req.query()), new Date())))

  // Unknown agent: 404 from getAgent. No finished runs in 7 days: JSON null.
  api.get('/agents/:id/health', (c) => {
    const agentId = c.req.param('id')
    getAgent(db, agentId)
    return c.json(computeHealth(db, agentId, new Date()))
  })

  return api
}
