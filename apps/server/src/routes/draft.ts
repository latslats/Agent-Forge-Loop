import { CreateFromTemplateBody, DraftAgentBody } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import { createAgent, getAgent, publishVersion } from '../db/agents.ts'
import type { Db } from '../db/sqlite.ts'
import { callDraftModel, type DraftModelCall, draftAgent } from '../draft.ts'
import type { EngineDeps } from '../engine/types.ts'
import { getTemplate, listTemplates } from '../templates.ts'
import { readJson } from './read-json.ts'

// Mounted at /api. `call` is the model call; tests inject a fake, the app uses the real one.
export const draftRoutes = (
  db: Db,
  deps: EngineDeps,
  call: DraftModelCall = callDraftModel(deps.apiKey),
) => {
  const api = new Hono()

  // A failed model call throws DraftError, which app.ts maps to 502.
  api.post('/draft', async (c) => {
    const body = DraftAgentBody.parse(await readJson(c))
    return c.json(await draftAgent(body, call))
  })

  api.get('/templates', (c) => c.json(listTemplates()))

  api.post('/templates/:id/agents', async (c) => {
    const body = CreateFromTemplateBody.parse(await readJson(c))
    const template = getTemplate(c.req.param('id'))
    const created = createAgent(db, {
      name: body.name ?? template.name,
      description: template.description,
      draft: template.definition,
    })
    publishVersion(db, created.id, `From template ${template.id}`)
    return c.json(getAgent(db, created.id), 201)
  })

  return api
}
