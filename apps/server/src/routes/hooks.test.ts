import { AgentDefinition, TriggerView, WebhookAccepted } from '@agentforgeloop/shared'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { getRun } from '../db/runs.ts'
import { type Db, migrate, openDb } from '../db/sqlite.ts'
import { fakeLlm, publishAgent, testEngine, textMessage, waitFor } from '../engine/testing.ts'

const position = { x: 0, y: 0 }

/** A code-only graph: the trigger, one code step that echoes the input, and the output. */
const echoDefinition = AgentDefinition.parse({
  name: 'Echo hook',
  nodes: [
    { id: 'trigger', type: 'trigger', label: 'Start', position },
    { id: 'echo', type: 'code', label: 'Echo', source: 'return input', position },
    { id: 'out', type: 'output', label: 'Done', template: '{{prev}}', position },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'echo' },
    { id: 'e2', from: 'echo', to: 'out' },
  ],
})

const setup = async () => {
  const db: Db = openDb(':memory:')
  migrate(db)
  const app = createApp(
    db,
    testEngine(
      db,
      fakeLlm(async () => textMessage('')),
    ),
  )
  const agentId = publishAgent(db, echoDefinition)
  const created = await app.request(
    `/api/agents/${agentId}/triggers`,
    json('POST', { kind: 'webhook' }),
  )
  const trigger = TriggerView.parse(await created.json())
  return { db, app, agentId, hookPath: trigger.webhookUrl ?? '', triggerId: trigger.id }
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const post = (app: Awaited<ReturnType<typeof setup>>['app'], path: string, body?: unknown) =>
  app.request(path, json('POST', body))

describe('POST /hooks/:agentId/:secret', () => {
  it('answers 202 with a run id, and the run is a webhook run with the body as input', async () => {
    const { db, app, hookPath } = await setup()

    const res = await post(app, hookPath, { input: 'hello' })

    expect(res.status).toBe(202)
    const { runId } = WebhookAccepted.parse(await res.json())
    expect(getRun(db, runId)).toMatchObject({ triggerKind: 'webhook', input: 'hello' })
    await waitFor(() => getRun(db, runId).status === 'succeeded')
  })

  it('uses the whole body as the input when it has no input key', async () => {
    const { db, app, hookPath } = await setup()

    const res = await post(app, hookPath, { ticket: 7 })

    const { runId } = WebhookAccepted.parse(await res.json())
    expect(getRun(db, runId).input).toEqual({ ticket: 7 })
  })

  it('answers 404 for an unknown secret, and for a disabled webhook', async () => {
    const { db, app, agentId, hookPath, triggerId } = await setup()

    expect((await post(app, `/hooks/${agentId}/nope`, {})).status).toBe(404)

    await app.request(`/api/triggers/${triggerId}`, json('PATCH', { enabled: false }))
    const disabled = await post(app, hookPath, {})
    expect(disabled.status).toBe(404)
    expect(await disabled.json()).toEqual({ error: 'not found' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM runs').get()).toEqual({ n: 0 })
  })

  it('answers 409 while the agent is paused', async () => {
    const { db, app, agentId, hookPath } = await setup()
    db.prepare("UPDATE agents SET status = 'paused' WHERE id = ?").run(agentId)

    const res = await post(app, hookPath, {})

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'agent is paused' })
  })
})
