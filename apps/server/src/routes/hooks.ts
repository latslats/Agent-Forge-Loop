import { WebhookAccepted } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import type { Db } from '../db/sqlite.ts'
import { resolveWebhook } from '../db/triggers.ts'
import { startRun } from '../engine/executor.ts'
import type { EngineDeps } from '../engine/types.ts'
import { readJson } from './read-json.ts'

// A body with an 'input' key is unwrapped; any other body is the input as it is.
const runInput = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && !Array.isArray(body) && 'input' in body
    ? body.input
    : body

// Mounted at /hooks, so the path is /hooks/:agentId/:secret.
export const hookRoutes = (db: Db, deps: EngineDeps) => {
  const api = new Hono()

  api.post('/:agentId/:secret', async (c) => {
    const agentId = c.req.param('agentId')
    resolveWebhook(db, agentId, c.req.param('secret'))

    const run = startRun(deps, {
      agentId,
      triggerKind: 'webhook',
      input: runInput(await readJson(c)),
    })
    return c.json(WebhookAccepted.parse({ runId: run.id }), 202)
  })

  return api
}
