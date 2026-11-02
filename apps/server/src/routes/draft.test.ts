import { Agent, DraftAgentResponse, TemplateSummary } from '@agentforgeloop/shared'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { getAgentWithVersions } from '../db/agents.ts'
import { migrate, openDb } from '../db/sqlite.ts'
import type { DraftModelCall } from '../draft.ts'
import { RunBus } from '../engine/bus.ts'
import { createLlm } from '../engine/llm.ts'
import { createToolRegistry } from '../engine/tools/registry.ts'
import type { EngineDeps } from '../engine/types.ts'
import { getTemplate } from '../templates.ts'
import { draftRoutes } from './draft.ts'

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const setup = (call: DraftModelCall) => {
  const db = openDb(':memory:')
  migrate(db)
  const engine: EngineDeps = {
    db,
    llm: createLlm(undefined),
    tools: createToolRegistry(),
    bus: new RunBus(),
  }
  const app = new Hono().route('/api', draftRoutes(db, engine, call))
  return { app, db }
}

const validDraft = () => structuredClone(getTemplate('support-email-triage').definition)

describe('draft routes', () => {
  it('POST /api/draft returns the drafted definition and its problems', async () => {
    const { app } = setup(async () => JSON.stringify(validDraft()))

    const response = await app.request(
      '/api/draft',
      json('POST', { description: 'Triage inbound support emails', model: 'claude-haiku-5-5' }),
    )

    expect(response.status).toBe(200)
    const body = DraftAgentResponse.parse(await response.json())
    expect(body.problems).toEqual([])
    expect(body.definition.model).toBe('claude-haiku-5-5')
  })

  it('POST /api/draft answers 502 when the model cannot be called (no key)', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const engine: EngineDeps = {
      db,
      llm: createLlm(undefined),
      tools: createToolRegistry(),
      bus: new RunBus(),
    }
    const response = await createApp(db, engine).request(
      '/api/draft',
      json('POST', { description: 'Triage inbound support emails' }),
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'ANTHROPIC_API_KEY is not set (add it to .env)',
    })
  })

  it('GET /api/templates lists the three templates', async () => {
    const { app } = setup(async () => JSON.stringify(validDraft()))

    const response = await app.request('/api/templates')

    const list = (await response.json()) as unknown[]
    expect(list.map((item) => TemplateSummary.parse(item).id)).toEqual([
      'support-email-triage',
      'invoice-extraction',
      'daily-news-digest',
    ])
  })

  it('POST /api/templates/:id/agents creates a published agent from the template', async () => {
    const { app, db } = setup(async () => JSON.stringify(validDraft()))

    const response = await app.request(
      '/api/templates/support-email-triage/agents',
      json('POST', { name: 'Acme support' }),
    )

    expect(response.status).toBe(201)
    const agent = Agent.parse(await response.json())
    expect(agent).toMatchObject({ name: 'Acme support', status: 'active', currentVersion: 1 })
    const detail = getAgentWithVersions(db, agent.id)
    expect(detail.versions[0]?.definition.nodes).toHaveLength(
      getTemplate('support-email-triage').definition.nodes.length,
    )
  })

  it('uses the template name when the body has none, and 404s an unknown template', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const app = createApp(db)

    const created = await app.request('/api/templates/invoice-extraction/agents', json('POST', {}))
    expect(Agent.parse(await created.json()).name).toBe('Invoice data extraction')

    const missing = await app.request('/api/templates/nope/agents', json('POST', {}))
    expect(missing.status).toBe(404)
  })

  it('rejects a description that is too short before calling the model', async () => {
    const db = openDb(':memory:')
    migrate(db)
    const app = createApp(db)

    const response = await app.request('/api/draft', json('POST', { description: 'short' }))

    expect(response.status).toBe(400)
  })
})
