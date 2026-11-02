import { CreateTriggerBody, UpdateTriggerBody } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import type { Db } from '../db/sqlite.ts'
import { createTrigger, deleteTrigger, listTriggers, updateTrigger } from '../db/triggers.ts'
import type { EngineDeps } from '../engine/types.ts'
import type { Scheduler } from '../scheduler.ts'
import { readJson } from './read-json.ts'

// Mounted at /api, so paths here carry the full suffix, e.g. '/agents/:id/triggers'.
export const triggerRoutes = (db: Db, _deps: EngineDeps, scheduler: Scheduler) => {
  const api = new Hono()

  api.get('/agents/:id/triggers', (c) => c.json(listTriggers(db, c.req.param('id'))))

  api.post('/agents/:id/triggers', async (c) => {
    const body = CreateTriggerBody.parse(await readJson(c))
    const trigger = createTrigger(db, c.req.param('id'), body)
    scheduler.reload()
    return c.json(trigger, 201)
  })

  api.patch('/triggers/:id', async (c) => {
    const patch = UpdateTriggerBody.parse(await readJson(c))
    const trigger = updateTrigger(db, c.req.param('id'), patch)
    scheduler.reload()
    return c.json(trigger)
  })

  api.delete('/triggers/:id', (c) => {
    deleteTrigger(db, c.req.param('id'))
    scheduler.reload()
    return c.body(null, 204)
  })

  return api
}
