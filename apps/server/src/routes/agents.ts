import { CreateAgentBody, PublishVersionBody, UpdateAgentBody } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import {
  createAgent,
  deleteAgent,
  getAgentWithVersions,
  listAgents,
  listVersions,
  publishVersion,
  updateAgent,
} from '../db/agents.ts'
import type { Db } from '../db/sqlite.ts'
import { readJson } from './read-json.ts'

export const agentRoutes = (db: Db) => {
  const api = new Hono()

  api.get('/', (c) => c.json(listAgents(db)))

  api.post('/', async (c) => {
    const body = CreateAgentBody.parse(await readJson(c))
    return c.json(createAgent(db, body), 201)
  })

  api.get('/:id', (c) => c.json(getAgentWithVersions(db, c.req.param('id'))))

  api.patch('/:id', async (c) => {
    const body = UpdateAgentBody.parse(await readJson(c))
    return c.json(updateAgent(db, c.req.param('id'), body))
  })

  api.delete('/:id', (c) => {
    deleteAgent(db, c.req.param('id'))
    return c.body(null, 204)
  })

  api.get('/:id/versions', (c) => c.json(listVersions(db, c.req.param('id'))))

  api.post('/:id/versions', async (c) => {
    const body = PublishVersionBody.parse(await readJson(c))
    return c.json(publishVersion(db, c.req.param('id'), body.note), 201)
  })

  return api
}
