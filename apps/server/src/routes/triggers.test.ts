import { TriggerView } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createAgent } from '../db/agents.ts'
import { migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, testEngine, textMessage } from '../engine/testing.ts'

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const setup = () => {
  const db = openDb(':memory:')
  migrate(db)
  const app = createApp(
    db,
    testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    ),
  )
  const agentId = createAgent(db, { name: 'Scheduled', description: '' }).id
  return { app, agentId }
}

describe('trigger routes', () => {
  it('creates a schedule with 201 and lists it for the agent', async () => {
    const { app, agentId } = setup()

    const res = await app.request(
      `/api/agents/${agentId}/triggers`,
      json('POST', { kind: 'schedule', cron: '*/30 * * * *', timezone: 'Europe/Berlin' }),
    )

    expect(res.status).toBe(201)
    expect(TriggerView.parse(await res.json())).toMatchObject({
      kind: 'schedule',
      enabled: true,
      webhookUrl: null,
      config: { kind: 'schedule', cron: '*/30 * * * *', timezone: 'Europe/Berlin' },
    })
    const listed = TriggerView.array().parse(
      await (await app.request(`/api/agents/${agentId}/triggers`)).json(),
    )
    expect(listed).toHaveLength(1)
  })

  it('answers 400 "invalid cron" for a cron that does not parse, and creates nothing', async () => {
    const { app, agentId } = setup()

    const res = await app.request(
      `/api/agents/${agentId}/triggers`,
      json('POST', { kind: 'schedule', cron: 'every day' }),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid cron' })
    expect(await (await app.request(`/api/agents/${agentId}/triggers`)).json()).toEqual([])
  })

  it('creates a webhook whose URL carries a secret, and answers 404 for an unknown agent', async () => {
    const { app, agentId } = setup()

    const created = TriggerView.parse(
      await (
        await app.request(`/api/agents/${agentId}/triggers`, json('POST', { kind: 'webhook' }))
      ).json(),
    )

    expect(created.webhookUrl).toMatch(new RegExp(`^/hooks/${agentId}/[0-9a-f]{32}$`))
    expect((await app.request('/api/agents/nope/triggers')).status).toBe(404)
  })

  it('patches enabled and the cron, rejects a bad cron, and deletes with 204', async () => {
    const { app, agentId } = setup()
    const created = TriggerView.parse(
      await (
        await app.request(
          `/api/agents/${agentId}/triggers`,
          json('POST', { kind: 'schedule', cron: '0 9 * * *' }),
        )
      ).json(),
    )
    const path = `/api/triggers/${created.id}`

    const off = await app.request(path, json('PATCH', { enabled: false }))
    expect(TriggerView.parse(await off.json())).toMatchObject({ enabled: false })

    const bad = await app.request(path, json('PATCH', { cron: 'nope' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid cron' })

    expect((await app.request(path, json('DELETE'))).status).toBe(204)
    expect((await app.request(path, json('DELETE'))).status).toBe(404)
  })
})
